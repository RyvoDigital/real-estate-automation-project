import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

/**
 * One headless Chrome, driven over CDP, for every probe that needs a real
 * render. No browser dependency — Node 22's global WebSocket and the DevTools
 * protocol.
 *
 * ⚠️ EXTRACTED HERE RATHER THAN IMPORTED FROM probe-layout.ts, which calls
 * `main()` at module scope: importing it to borrow `launch()` would have RUN
 * THE ENTIRE LAYOUT PROBE as a side effect of the import. Lesson 15 — one
 * implementation, in a file whose only job is to be imported.
 *
 * ⚠️ AND EVERYTHING READS ITS ENVIRONMENT AT CALL TIME, not at module scope.
 * A probe loads `.env.local` in its own body, and a module that built a
 * Supabase client while being imported would capture `undefined` — which is
 * the trap probe-segmentation.ts records and the reason it uses `require`.
 * Reading late means a static import is safe again.
 */

export type Chrome = { send: (m: string, p?: unknown) => Promise<any>; kill: () => void }

export async function launch(): Promise<Chrome> {
  // Read at CALL time, per the header. A module-scope constant here would
  // capture the environment as it stood when the import ran.
  const CHROME =
    process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  const dir = mkdtempSync(join(tmpdir(), 'ryvo-probe-'))
  const proc = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    `--user-data-dir=${dir}`,
    '--remote-debugging-port=0',
    'about:blank',
  ])

  const port = await new Promise<number>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Chrome did not report a debugging port')), 20_000)
    proc.stderr.on('data', (b: Buffer) => {
      const m = b.toString().match(/ws:\/\/127\.0\.0\.1:(\d+)\//)
      if (m) {
        clearTimeout(t)
        resolve(Number(m[1]))
      }
    })
  })

  // The page target that already exists — no /json/new, which needs a PUT in
  // recent Chrome and is one more thing to get wrong.
  let wsUrl = ''
  for (let i = 0; i < 40 && !wsUrl; i++) {
    const list = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
      type: string
      webSocketDebuggerUrl?: string
    }[]
    wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? ''
    if (!wsUrl) await new Promise((r) => setTimeout(r, 100))
  }
  if (!wsUrl) throw new Error('no page target')

  const ws = new WebSocket(wsUrl)
  await new Promise<void>((res, rej) => {
    ws.onopen = () => res()
    ws.onerror = () => rej(new Error('devtools socket failed'))
  })

  let id = 0
  const waiting = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>()
  const events = new Map<string, (() => void)[]>()

  ws.onmessage = (e) => {
    const msg = JSON.parse(String(e.data))
    if (msg.id !== undefined) {
      const w = waiting.get(msg.id)
      waiting.delete(msg.id)
      if (!w) return
      if (msg.error) w.rej(new Error(`${msg.error.message}`))
      else w.res(msg.result)
    } else if (msg.method) {
      const fns = events.get(msg.method) ?? []
      events.set(msg.method, [])
      for (const fn of fns) fn()
    }
  }

  const send = (method: string, params?: unknown) =>
    new Promise<any>((res, rej) => {
      const n = ++id
      waiting.set(n, { res, rej })
      ws.send(JSON.stringify({ id: n, method, params: params ?? {} }))
      setTimeout(() => {
        if (waiting.delete(n)) rej(new Error(`${method} timed out`))
      }, 30_000)
    })

  ;(send as any).once = (method: string) =>
    new Promise<void>((res) => events.set(method, [...(events.get(method) ?? []), res]))

  return {
    send: Object.assign(send, { once: (send as any).once }),
    kill: () => {
      ws.close()
      proc.kill()
    },
  }
}

/** A signed-in session, as cookies, for whatever base URL the probe uses. */
export async function sessionCookies(email: string, base = process.env.PROBE_BASE ?? 'http://localhost:3000'): Promise<{ name: string; value: string }[]> {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw new Error(`generateLink failed: ${error.message}`)
  const hash = (data!.properties as { hashed_token: string }).hashed_token
  const r = await fetch(`${base}/auth/callback?token_hash=${hash}&type=magiclink`, {
    redirect: 'manual',
  })
  const out: { name: string; value: string }[] = []
  for (const raw of r.headers.getSetCookie?.() ?? []) {
    const pair = raw.split(';')[0]
    const i = pair.indexOf('=')
    const name = pair.slice(0, i).trim()
    const value = pair.slice(i + 1).trim()
    if (value) out.push({ name, value })
  }
  return out
}

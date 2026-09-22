import { requireOperator } from '@/lib/auth'
import { readCounts } from '@/lib/counts'
import { Frame } from '@/components/Frame'
import { StateChip } from '@/components/state-chip'
import { readOnboardingIndex, readOnboardingOne } from '@/lib/onboarding-read'
import { Checklist } from '@/components/onboarding/Checklist'
import { ClientList } from '@/components/onboarding/ClientList'
import { NewClient } from '@/components/onboarding/NewClient'
import { lisbonToday } from '@/lib/month/model'
import styles from '@/components/onboarding/onboarding.module.css'

/*
 * /onboarding (brief §2.8; route map §7: the URL stays, the screen is rebuilt).
 * Checkpoint 2, 22 Sep 2026: on the Frame, in The Month's direction.
 *
 *   /onboarding              every client and where it stands, and the form to
 *                            take on a new one (S1, S2)
 *   /onboarding?client=<id>  that client's checklist (S6)
 *
 * The page decides nothing: the checklist model (lib/onboarding-checklist.ts)
 * decides every state and is tested there.
 */
export const dynamic = 'force-dynamic'

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const operator = await requireOperator()
  const [counts, q] = await Promise.all([readCounts(), searchParams])
  const raw = Array.isArray(q.client) ? q.client[0] : q.client
  const clientId = raw && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null

  if (clientId) {
    const one = await readOnboardingOne(clientId)
    return (
      <Frame mode="operator" current="onboarding" counts={counts} operatorEmail={operator.email}>
        <div className={styles.page}>
          <a className={styles.back} href="/onboarding">← All clients</a>
          {!one ? (
            <p className={styles.empty}><StateChip meaning="grey">not found</StateChip> That client could not be read, or is a deploy-gate test client.</p>
          ) : (
            <>
              <div className={styles.top}>
                <h1 className={styles.title}>{one.client.name}</h1>
                {one.checklist.onboarded ? <StateChip meaning="through">onboarded</StateChip> : <StateChip meaning="grey">not onboarded</StateChip>}
              </div>
              <p className={styles.lede}>{one.checklist.headline}</p>
              <Checklist clientId={one.client.id} model={one.checklist} others={one.others} recordable={one.recordable} today={one.today} createdOn={one.createdOn} />
              <p className={styles.note}>Not on this checklist yet (brief §2.8): the signed services contract and the data-processing annex. The contract is recorded on The Month; the annex is not recorded anywhere yet.</p>
            </>
          )}
        </div>
      </Frame>
    )
  }

  const index = await readOnboardingIndex()
  const items = index.clients?.map(({ client, checklist }) => ({
    id: client.id, name: client.name, rehearsal: client.rehearsal, createdOn: lisbonToday(new Date(client.created_at)), checklist,
  })) ?? null
  return (
    <Frame mode="operator" current="onboarding" counts={counts} operatorEmail={operator.email}>
      <div className={styles.page}>
        <div className={styles.top}>
          <h1 className={styles.title}>Onboarding</h1>
        </div>
        <p className={styles.lede}>A client is onboarded when <b>every</b> step is done, including the two conversations only the agency can have. Until then nothing may be sent to anybody, and this screen says what is left.</p>
        <div className={styles.cols}>
          <ClientList items={items} failure={index.failure} />
          <NewClient />
        </div>
      </div>
    </Frame>
  )
}

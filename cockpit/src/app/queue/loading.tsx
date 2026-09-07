import { IconChat, IconMenu, IconPerson, IconWarning } from '@/components/Icons'

/**
 * Shown while the queue query runs.
 *
 * The tab bar is real, not a skeleton: it needs no data, so it paints on the
 * first frame and the app never looks like it failed to start. Only the part
 * that is genuinely waiting is drawn as a placeholder, and it mirrors the real
 * layout so nothing shifts when the data lands.
 */
export default function Loading() {
  return (
    <div className="shell">
      <main className="main" aria-busy="true" aria-live="polite">
        <header className="head">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="eyebrow">Waiting on you</span>
            <h1 className="head__title">Escalations</h1>
          </div>
        </header>

        <div className="hero hero--t0" aria-hidden>
          <span className="hero__top">
            <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="skeleton" style={{ width: 84, height: 11, borderRadius: 5 }} />
              <span className="skeleton" style={{ width: 150, height: 46, borderRadius: 10 }} />
            </span>
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="skeleton" style={{ width: '62%', height: 19, borderRadius: 7 }} />
            <span className="skeleton" style={{ width: '80%', height: 13, borderRadius: 6 }} />
          </span>
          <span className="skeleton" style={{ height: 58, borderRadius: 16 }} />
          <span className="skeleton" style={{ height: 50, borderRadius: 16 }} />
        </div>

        <div className="rows" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="row" style={{ opacity: 1 - i * 0.35 }}>
              <span className="row__spine" />
              <span className="row__body" style={{ gap: 7 }}>
                <span className="skeleton" style={{ width: '55%', height: 14, borderRadius: 6 }} />
                <span className="skeleton" style={{ width: '38%', height: 11, borderRadius: 5 }} />
              </span>
              <span className="skeleton" style={{ width: 54, height: 15, borderRadius: 6 }} />
            </div>
          ))}
        </div>

        <span style={{ fontSize: 13, color: 'var(--ink-4)' }}>Loading the queue…</span>
      </main>

      <nav className="tabs" aria-label="Sections">
        <span className="tab tab--on">
          <IconWarning size={21} />
          <span>Queue</span>
        </span>
        <span className="tab">
          <IconPerson size={21} />
          <span>Leads</span>
        </span>
        <span className="tab">
          <IconChat size={21} />
          <span>Report</span>
        </span>
        <span className="tab">
          <IconMenu size={21} />
          <span>More</span>
        </span>
      </nav>
    </div>
  )
}

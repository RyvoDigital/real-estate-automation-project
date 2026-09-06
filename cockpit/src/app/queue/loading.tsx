/**
 * Shown while the queue query runs. Without it the screen sits blank and
 * then pops, which on a phone reads as the app having failed — and the one
 * thing this screen must never be is ambiguous about whether it has loaded.
 * The skeleton mirrors the real layout so nothing shifts when data lands.
 */
export default function Loading() {
  return (
    <div className="shell">
      <nav className="nav">
        <div className="nav__brand">
          <div className="nav__mark">R</div>
        </div>
        <span className="nav__item nav__item--on">
          <span className="nav__label">Escalations</span>
        </span>
      </nav>

      <main className="main" aria-busy="true" aria-live="polite">
        <div className="topbar">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexGrow: 1 }}>
            <h1 className="topbar__title">Escalations</h1>
            <span className="skeleton" style={{ width: 220, height: 13, borderRadius: 6 }} />
          </div>
        </div>

        <div className="skeleton" style={{ height: 36, borderRadius: 12 }} />

        <div className="stack">
          {[0, 1].map((i) => (
            <div key={i} className="card card--t0" style={{ opacity: 1 - i * 0.4 }}>
              <span className="card__spine" />
              <span className="card__body">
                <span className="card__head">
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span className="skeleton" style={{ width: 96, height: 26, borderRadius: 7 }} />
                    <span className="skeleton" style={{ width: 54, height: 9, borderRadius: 4 }} />
                  </span>
                  <span className="skeleton" style={{ width: 118, height: 26, borderRadius: 999 }} />
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span className="skeleton" style={{ width: '58%', height: 16, borderRadius: 6 }} />
                  <span className="skeleton" style={{ width: '82%', height: 12, borderRadius: 6 }} />
                  <span className="skeleton" style={{ width: '70%', height: 12, borderRadius: 6 }} />
                </span>
              </span>
            </div>
          ))}
        </div>

        <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>Loading the queue…</span>
      </main>
    </div>
  )
}

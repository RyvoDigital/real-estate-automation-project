import { requireOperator } from '@/lib/auth'
import { readCounts } from '@/lib/counts'
import { whyEmpty } from '@/lib/why-empty'
import { Frame } from '@/components/Frame'

/*
 * The landing. D2′ makes it The Month, and The Month is C7 because six of its
 * tables are proposals.
 *
 * 🔴 THIS USED TO REDIRECT, AND THE ROUTE MAP SAID IT SHOULD — to /today until
 * The Month exists. That was written before the sixth meaning of nothing
 * existed, and it is the worse answer now.
 *
 * A redirect makes the landing look like Today, which is a page that DOES
 * exist, so the absence disappears: clicking "The Month" would quietly land
 * somewhere else and nothing would say why. Saying "we have not built this"
 * is the same call the operator made for Today's three undersupplied groups,
 * and for the same reason — an unbuilt thing that hides itself lies by
 * omission.
 */
export const dynamic = 'force-dynamic'

export default async function Landing() {
  const operator = await requireOperator()
  const counts = await readCounts()

  const gap = whyEmpty({
    state: 'notBuilt',
    thing: 'the month — what came in, what it cost, and what is contracted',
    haveWhat:
      'nothing reads it, and nothing could: client_contracts, client_payments, web_clients, web_contracts, costs and cost_checks are all proposals in brief I §2.11 rather than tables',
    when: 'it is the last thing built, because a screen against a table that does not exist has an emptiness that means neither resting nor never',
  })

  return (
    <Frame mode="operator" current="month" counts={counts} operatorEmail={operator.email}>
      <h1
        style={{
          margin: 0,
          fontFamily: 'var(--display)',
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: '-0.03em',
          color: 'var(--text)',
        }}
      >
        The Month
      </h1>
      <p
        style={{
          maxWidth: '70ch',
          marginTop: 14,
          padding: '16px 18px',
          borderRadius: 18,
          border: '1px dashed var(--edge-2)',
          fontSize: 14.5,
          color: 'var(--text-2)',
        }}
      >
        {gap.sentence}
      </p>
      <p style={{ marginTop: 18, fontSize: 14.5 }}>
        {/* 🔒 A real tap target. As an inline <a> this was 18px tall at 360px,
            under the 44px floor tests/probe-layout.ts asserts — caught by the
            probe on the first run after this page existed, which is the probe
            doing exactly its job on a page written in five minutes. */}
        <a
          href="/today"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 44,
            padding: '8px 0',
            color: 'var(--text)',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
          }}
        >
          Today is built — go there instead
        </a>
      </p>
    </Frame>
  )
}

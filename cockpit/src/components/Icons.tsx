type P = { size?: number; className?: string }

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export function IconWarning({ size = 16, className }: P) {
  return (
    <svg {...base(size)} strokeWidth={2.1} className={className} aria-hidden>
      <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

export function IconStar({ size = 16, className }: P) {
  return (
    <svg {...base(size)} strokeWidth={2} className={className} aria-hidden>
      <path d="M12 2.6 15 9l6.4.6-4.8 4.3 1.4 6.3L12 17l-6 3.2 1.4-6.3L2.6 9.6 9 9z" />
    </svg>
  )
}

export function IconPerson({ size = 16, className }: P) {
  return (
    <svg {...base(size)} strokeWidth={2} className={className} aria-hidden>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  )
}

export function IconHome({ size = 17, className }: P) {
  return (
    <svg {...base(size)} strokeWidth={1.7} className={className} aria-hidden>
      <path d="M3 11 12 3l9 8" />
      <path d="M5 10v10h14V10" />
    </svg>
  )
}

export function IconChat({ size = 17, className }: P) {
  return (
    <svg {...base(size)} strokeWidth={1.7} className={className} aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
    </svg>
  )
}

export function IconCalendar({ size = 17, className }: P) {
  return (
    <svg {...base(size)} strokeWidth={1.7} className={className} aria-hidden>
      <rect x="3" y="4" width="18" height="17" rx="2.5" />
      <path d="M8 2.5v4M16 2.5v4M3 10h18" />
    </svg>
  )
}

export function IconPulse({ size = 17, className }: P) {
  return (
    <svg {...base(size)} strokeWidth={1.7} className={className} aria-hidden>
      <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />
    </svg>
  )
}

export function IconClock({ size = 17, className }: P) {
  return (
    <svg {...base(size)} strokeWidth={1.7} className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

export function IconChevron({ size = 16, className }: P) {
  return (
    <svg {...base(size)} strokeWidth={1.8} className={className} aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

export function IconBack({ size = 16, className }: P) {
  return (
    <svg {...base(size)} strokeWidth={1.8} className={className} aria-hidden>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  )
}

export function IconLock({ size = 16, className }: P) {
  return (
    <svg {...base(size)} strokeWidth={1.8} className={className} aria-hidden>
      <rect x="4" y="10" width="16" height="10" rx="2.4" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

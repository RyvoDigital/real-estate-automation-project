'use client'

import { useFormStatus } from 'react-dom'
import styles from './listings.module.css'

/** Disabled only while its own save is in flight, so a double click cannot become two acts. */
export function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return <button type="submit" className={styles.primary} disabled={pending} aria-busy={pending}>{children}</button>
}

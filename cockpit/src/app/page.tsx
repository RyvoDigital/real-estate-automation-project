import { redirect } from 'next/navigation'

export default function Home() {
  // The queue is the product. Nothing else is the landing page.
  redirect('/queue')
}

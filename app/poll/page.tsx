import { genPageMetadata } from 'app/seo'
import CommissionerPoll from '@/components/CommissionerPoll'

export const metadata = genPageMetadata({ title: 'Commissioner’s Poll' })

export default function Page() {
  return (
    <div className="container py-12">
      <CommissionerPoll />
    </div>
  )
}
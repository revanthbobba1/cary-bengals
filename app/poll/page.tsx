import { genPageMetadata } from 'app/seo'
import CommissionerPoll from '@/components/CommissionerPoll'
import PageHeader from '@/components/PageHeader'

export const metadata = genPageMetadata({ title: 'Commissioner’s Poll' })

export default function Page() {
  return (
    <div className="container pb-12">
      <PageHeader title="Poll" subtitle="Commissioner’s weekly power rankings" />
      <CommissionerPoll />
    </div>
  )
}

import PageHeader from '@/components/PageHeader'
import { genPageMetadata } from 'app/seo'
import { createClient } from '@/lib/supabase/server'
import { isCommissioner } from '@/lib/supabase/roles'
import { openApiSpec } from '@/lib/openapi/spec'
import AdminSubNav from '@/components/AdminSubNav'
import SwaggerViewer from './SwaggerViewer'

export const metadata = genPageMetadata({ title: 'API Docs' })

export default async function ApiDocsPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div>
      <PageHeader
        title="API Docs"
        subtitle="Every endpoint in the application, site and ESPN service."
      />

      <AdminSubNav active="api-docs" showCommissionerTools={isCommissioner(user)} />

      <SwaggerViewer spec={openApiSpec} />
    </div>
  )
}

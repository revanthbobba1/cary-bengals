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
      <div className="space-y-2 pb-8 pt-6 md:space-y-5">
        <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-ink dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
          API Docs
        </h1>
        <p className="text-lg leading-7 text-gray-500 dark:text-gray-400">
          Every endpoint in the application, site and ESPN service.
        </p>
      </div>

      <AdminSubNav active="api-docs" showCommissionerTools={isCommissioner(user)} />

      <SwaggerViewer spec={openApiSpec} />
    </div>
  )
}

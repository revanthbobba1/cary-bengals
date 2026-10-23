'use client'

import dynamic from 'next/dynamic'
import type { ComponentType } from 'react'
import 'swagger-ui-react/swagger-ui.css'

// Only the props used below -- the package's own typings don't line up with this React version.
interface SwaggerProps {
  spec: object
  docExpansion?: 'list' | 'full' | 'none'
  defaultModelsExpandDepth?: number
}

// swagger-ui-react reaches for `window` at import time, so it can't render on the server.
const SwaggerUI = dynamic(
  () =>
    import('swagger-ui-react').then((mod) => mod.default as unknown as ComponentType<SwaggerProps>),
  {
    ssr: false,
    loading: () => <p className="text-gray-500 dark:text-gray-400">Loading API docs…</p>,
  }
)

export default function SwaggerViewer({ spec }: { spec: Record<string, unknown> }) {
  return (
    <div className="swagger-viewer rounded-card bg-white p-2 text-gray-900">
      <SwaggerUI spec={spec} docExpansion="list" defaultModelsExpandDepth={0} />
    </div>
  )
}

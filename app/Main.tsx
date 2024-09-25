import React from 'react'
import siteMetadata from '@/data/siteMetadata'
import CoachesPoll from './poll'

export default function Home() {
  return (
    <div className="flex flex-col space-y-6">
      <p className="text-lg leading-7 text-gray-500 dark:text-gray-400">
        {siteMetadata.description}
      </p>
      <div className="flex flex-col md:flex-row md:space-x-6">
        <div className="md:w-1/3 mt-8 md:mt-0">
          <CoachesPoll />
        </div>
      </div>
    </div>
  )
}
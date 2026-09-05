'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { easeOut } from '@/lib/motion'
import type { ReactNode } from 'react'

const pageVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0 } }

export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const reduceMotion = useReducedMotion()

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        variants={pageVariants}
        initial={reduceMotion ? false : 'hidden'}
        animate="visible"
        exit={reduceMotion ? undefined : 'exit'}
        transition={easeOut}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

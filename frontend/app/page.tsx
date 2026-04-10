'use client'

import dynamic from 'next/dynamic'
import { useFlow } from './_components/AppLayout'

const HomePage = dynamic(() => import('@/components/HomePage'), { ssr: false })

export default function Home() {
  const { openFlow } = useFlow()
  return <HomePage onStart={openFlow} />
}

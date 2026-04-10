'use client'

import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useFlow } from '../_components/AppLayout'
import type { SavedRoadmap } from '@/services/roadmap-storage.service'

const SavedRoadmaps = dynamic(() => import('@/components/SavedRoadmaps'), { ssr: false })

export default function RoadmapsPage() {
  const router = useRouter()
  const { openFlow } = useFlow()

  const handleViewRoadmap = (roadmap: SavedRoadmap) => {
    router.push(`/roadmaps/view?id=${roadmap.id}`)
  }

  const handleCreateNew = () => {
    openFlow()
    router.push('/')
  }

  return (
    <SavedRoadmaps
      onViewRoadmap={handleViewRoadmap}
      onCreateNew={handleCreateNew}
    />
  )
}

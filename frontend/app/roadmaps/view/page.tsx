'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'
import dynamic from 'next/dynamic'
import RoadmapStorageService from '@/services/roadmap-storage.service'
import type { SavedRoadmap } from '@/services/roadmap-storage.service'

const RoadmapPathView = dynamic(() => import('@/components/RoadmapPathView'), { ssr: false })

function RoadmapViewContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const id = searchParams.get('id')
  const [roadmap, setRoadmap] = useState<SavedRoadmap | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) {
      setNotFound(true)
      return
    }
    const found = RoadmapStorageService.getRoadmapById(id)
    if (found) {
      setRoadmap(found)
    } else {
      setNotFound(true)
    }
  }, [id])

  const handleBack = () => router.push('/roadmaps')

  if (notFound) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#64748b', fontFamily: 'Segoe UI, sans-serif' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🗺️</div>
        <p style={{ fontSize: 16 }}>Roadmap introuvable.</p>
        <button
          onClick={handleBack}
          style={{
            marginTop: 8,
            padding: '10px 20px',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            background: 'white',
            color: '#2563EB',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ← Retour aux roadmaps
        </button>
      </div>
    )
  }

  if (!roadmap) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
        Chargement...
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px' }}>
        <button
          onClick={handleBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            background: 'white',
            color: '#64748b',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            marginBottom: 20,
          }}
        >
          ← Retour aux roadmaps
        </button>
        <div style={{ borderRadius: 20, overflow: 'hidden', minHeight: '80vh' }}>
          <RoadmapPathView
            roadmap={roadmap.roadmap}
            profile={roadmap.profile}
            certStatuses={roadmap.certStatuses}
            levelData={{ niveau: roadmap.level, score: { pourcentage: 0, total: 0 } }}
            profileData={null}
            onCertClick={(cert: any) => console.log('Cert clicked:', cert)}
            onClose={handleBack}
            userId="demo-user"
            sessionId="demo-session"
          />
        </div>
      </div>
    </div>
  )
}

export default function RoadmapViewPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
        Chargement de la roadmap...
      </div>
    }>
      <RoadmapViewContent />
    </Suspense>
  )
}

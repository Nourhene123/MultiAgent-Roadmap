'use client'

import { useState, useCallback, createContext, useContext } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import RoadmapStorageService from '@/services/roadmap-storage.service'

// Dynamically import heavy modal to avoid SSR issues
const QuizFlowManager = dynamic(() => import('@/components/QuizFlowManager'), {
  ssr: false,
})

// ── Flow Context ──────────────────────────────────────────────────────────────

interface FlowContextType {
  openFlow: () => void
}

const FlowContext = createContext<FlowContextType>({ openFlow: () => {} })

export function useFlow() {
  return useContext(FlowContext)
}

// ── App Layout ────────────────────────────────────────────────────────────────

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [flowOpen, setFlowOpen] = useState(false)
  const [started, setStarted] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  const openFlow = useCallback(() => {
    setStarted(true)
    setFlowOpen(true)
  }, [])

  const handleCloseFlow = useCallback(() => {
    setFlowOpen(false)
    setStarted(false)
    if (RoadmapStorageService.hasRoadmaps()) {
      router.push('/roadmaps')
    }
  }, [router])

  return (
    <FlowContext.Provider value={{ openFlow }}>
      {/* ── Navigation Header ── */}
      <nav style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid #e2e8f0',
        padding: '12px 40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
          onClick={() => router.push('/')}
        >
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #2563EB, #1d4ed8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 900,
            fontSize: 16,
          }}>
            S
          </div>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#1a365d' }}>Subul</span>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => router.push('/')}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: pathname === '/' ? 'linear-gradient(135deg, #2563EB, #1d4ed8)' : 'transparent',
              color: pathname === '/' ? 'white' : '#64748b',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Accueil
          </button>
          <button
            onClick={() => router.push('/roadmaps')}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: pathname === '/roadmaps' ? 'linear-gradient(135deg, #2563EB, #1d4ed8)' : 'transparent',
              color: pathname === '/roadmaps' ? 'white' : '#64748b',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Mes Roadmaps
          </button>
        </div>
      </nav>

      {/* ── Page Content ── */}
      <div style={{ paddingTop: 60 }}>
        {children}
      </div>

      {/* ── Global Quiz Flow Modal (persists across routes) ── */}
      {started && (
        <QuizFlowManager
          open={flowOpen}
          onClose={handleCloseFlow}
          userId="demo-user"
          sessionId="demo-session"
        />
      )}
    </FlowContext.Provider>
  )
}

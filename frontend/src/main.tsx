import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import HomePage from './components/HomePage'
import QuizFlowManager from './components/QuizFlowManager'
import SavedRoadmaps from './components/SavedRoadmaps'
import RoadmapPathView from './components/RoadmapPathView'
import RoadmapStorageService, { SavedRoadmap } from './services/roadmap-storage.service'

type Page = 'home' | 'roadmaps' | 'view-roadmap';

function App() {
  const [page, setPage] = useState<Page>('home')
  const [started, setStarted] = useState(false)
  const [flowOpen, setFlowOpen] = useState(false)
  const [selectedRoadmap, setSelectedRoadmap] = useState<SavedRoadmap | null>(null)

  const userId = 'demo-user'
  const sessionId = 'demo-session'

  const handleStart = () => {
    setStarted(true)
    setFlowOpen(true)
  }

  const handleCloseFlow = () => {
    setFlowOpen(false)
    setStarted(false)
    // After closing flow, go to roadmaps page if we have saved roadmaps
    if (RoadmapStorageService.hasRoadmaps()) {
      setPage('roadmaps')
    }
  }

  const handleViewRoadmap = (roadmap: SavedRoadmap) => {
    setSelectedRoadmap(roadmap)
    setPage('view-roadmap')
  }

  const handleCreateNew = () => {
    setPage('home')
    handleStart()
  }

  const handleBackToRoadmaps = () => {
    setPage('roadmaps')
    setSelectedRoadmap(null)
  }

  return (
    <>
      {/* Navigation Header */}
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
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            cursor: 'pointer',
          }}
          onClick={() => setPage('home')}
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
          <span style={{
            fontSize: 18,
            fontWeight: 800,
            color: '#1a365d',
          }}>Subul</span>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => setPage('home')}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: page === 'home' ? 'linear-gradient(135deg, #2563EB, #1d4ed8)' : 'transparent',
              color: page === 'home' ? 'white' : '#64748b',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Accueil
          </button>
          <button
            onClick={() => setPage('roadmaps')}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: page === 'roadmaps' ? 'linear-gradient(135deg, #2563EB, #1d4ed8)' : 'transparent',
              color: page === 'roadmaps' ? 'white' : '#64748b',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Mes Roadmaps
          </button>
        </div>
      </nav>

      {/* Page Content */}
      <div style={{ paddingTop: 60 }}>
        {page === 'home' && (
          <HomePage onStart={handleStart} />
        )}

        {page === 'roadmaps' && (
          <SavedRoadmaps
            onViewRoadmap={handleViewRoadmap}
            onCreateNew={handleCreateNew}
          />
        )}

        {page === 'view-roadmap' && selectedRoadmap && (
          <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
            <div style={{
              maxWidth: 800,
              margin: '0 auto',
              padding: '40px 20px',
            }}>
              <button
                onClick={handleBackToRoadmaps}
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
              <div style={{
                borderRadius: 20,
                overflow: 'hidden',
                minHeight: '80vh',
              }}>
                <RoadmapPathView
                  roadmap={selectedRoadmap.roadmap}
                  profile={selectedRoadmap.profile}
                  certStatuses={selectedRoadmap.certStatuses}
                  levelData={{ niveau: selectedRoadmap.level, score: { pourcentage: 0, total: 0 } }}
                  profileData={null}
                  onCertClick={(cert) => console.log('Cert clicked:', cert)}
                  onClose={handleBackToRoadmaps}
                  userId={userId}
                  sessionId={sessionId}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Assessment + Roadmap flow modal */}
      {started && (
        <QuizFlowManager
          open={flowOpen}
          onClose={handleCloseFlow}
          userId={userId}
          sessionId={sessionId}
        />
      )}
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// @ts-nocheck
/**
 * RoadmapPage.tsx — Dedicated page for viewing saved roadmaps
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import RoadmapView from '../components/RoadmapView';
import RoadmapStorageService, { SavedRoadmap } from '../services/roadmap-storage.service';

// ─── Icons ────────────────────────────────────────────────────────────────────

const ArrowLeftIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
  </svg>
);

const MapPinIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);

// ─── Component ────────────────────────────────────────────────────────────────

export default function RoadmapPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [roadmap, setRoadmap] = useState<SavedRoadmap | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      const savedRoadmap = RoadmapStorageService.getRoadmapById(id);
      if (savedRoadmap) {
        setRoadmap(savedRoadmap);
      } else {
        setError('Roadmap non trouvé');
      }
      setIsLoading(false);
    } else {
      // No ID provided, show most recent roadmap
      const recent = RoadmapStorageService.getMostRecentRoadmap();
      if (recent) {
        setRoadmap(recent);
      } else {
        setError('Aucun roadmap sauvegardé');
      }
      setIsLoading(false);
    }
  }, [id]);

  const handleBack = () => {
    navigate('/roadmaps');
  };

  const handleGoHome = () => {
    navigate('/');
  };

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#f8fafc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#2563EB', marginBottom: 16 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
              <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
              <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
              <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
              <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
            </svg>
          </div>
          <p style={{ color: '#64748b', fontSize: 14 }}>Chargement du roadmap...</p>
        </div>
        <style>{`.animate-spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !roadmap) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#f8fafc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
      }}>
        <div style={{
          textAlign: 'center',
          background: 'white',
          padding: '40px 60px',
          borderRadius: 20,
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🗺️</div>
          <h2 style={{
            fontSize: 20,
            fontWeight: 700,
            color: '#1a365d',
            marginBottom: 12,
          }}>{error || 'Roadmap non disponible'}</h2>
          <p style={{
            fontSize: 14,
            color: '#64748b',
            marginBottom: 24,
          }}>
            Le roadmap que vous recherchez n'existe pas ou a été supprimé.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              onClick={handleGoHome}
              style={{
                padding: '12px 24px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, #2563EB, #1d4ed8)',
                border: 'none',
                color: 'white',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
              }}
            >
              Créer un roadmap
            </button>
            <button
              onClick={() => navigate('/roadmaps')}
              style={{
                padding: '12px 24px',
                borderRadius: 10,
                background: 'white',
                border: '1px solid #e2e8f0',
                color: '#64748b',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Voir mes roadmaps
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
      {/* Header */}
      <header style={{
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        padding: '16px 40px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{
          maxWidth: 1200,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={handleBack}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 16px',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                background: 'white',
                color: '#64748b',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <ArrowLeftIcon />
              Retour
            </button>
            <div style={{
              width: 1,
              height: 24,
              background: '#e2e8f0',
              margin: '0 8px',
            }} />
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #2563EB, #1d4ed8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
            }}>
              <MapPinIcon />
            </div>
            <div>
              <h1 style={{
                fontSize: 16,
                fontWeight: 700,
                color: '#1a365d',
                margin: 0,
              }}>{roadmap.title}</h1>
              <p style={{
                fontSize: 12,
                color: '#64748b',
                margin: 0,
              }}>
                {roadmap.profile} · {roadmap.level} · {new Date(roadmap.createdAt).toLocaleDateString('fr-FR')}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => navigate('/roadmaps')}
              style={{
                padding: '10px 18px',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                background: 'white',
                color: '#64748b',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Mes Roadmaps
            </button>
            <button
              onClick={handleGoHome}
              style={{
                padding: '10px 18px',
                borderRadius: 8,
                border: 'none',
                background: 'linear-gradient(135deg, #2563EB, #1d4ed8)',
                color: 'white',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
              }}
            >
              Nouveau
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{
        maxWidth: 1000,
        margin: '0 auto',
        padding: '32px 40px',
      }}>
        <div style={{
          background: 'white',
          borderRadius: 20,
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
          overflow: 'hidden',
          minHeight: 'calc(100vh - 200px)',
        }}>
          <RoadmapView
            roadmap={roadmap.roadmap}
            profile={roadmap.profile}
            levelData={{ niveau: roadmap.level, score: { pourcentage: 0, total: 0 } }}
            profileData={null}
            onClose={handleBack}
            userId="demo-user"
            sessionId="demo-session"
          />
        </div>
      </main>
    </div>
  );
}

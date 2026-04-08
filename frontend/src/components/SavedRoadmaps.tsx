// @ts-nocheck
/**
 * SavedRoadmaps.tsx — Page to view and manage saved roadmaps
 */

'use client';

import React, { useState, useEffect } from 'react';
import RoadmapStorageService, { SavedRoadmap } from '../services/roadmap-storage.service';

// ─── Icons ────────────────────────────────────────────────────────────────────

const MapPinIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);

const ArrowRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);

const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  onViewRoadmap: (roadmap: SavedRoadmap) => void;
  onCreateNew: () => void;
}

const PROFILE_ICONS: Record<string, string> = {
  cloud: '☁️',
  cyber: '🛡️',
  ai: '🤖',
  iot: '📡',
};

const PROFILE_LABELS: Record<string, string> = {
  cloud: 'Cloud & DevOps',
  cyber: 'Cybersécurité',
  ai: 'Intelligence Artificielle',
  iot: 'IoT & Systèmes',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SavedRoadmaps({ onViewRoadmap, onCreateNew }: Props) {
  const [roadmaps, setRoadmaps] = useState<SavedRoadmap[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadRoadmaps();
  }, []);

  const loadRoadmaps = () => {
    const saved = RoadmapStorageService.getAllRoadmaps();
    setRoadmaps(saved);
    setIsLoading(false);
  };

  const handleDelete = (id: string) => {
    if (deleteConfirm === id) {
      RoadmapStorageService.deleteRoadmap(id);
      loadRoadmaps();
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const calculateProgress = (roadmap: SavedRoadmap) => {
    if (!roadmap.certStatuses) return 0;
    const statuses = Object.values(roadmap.certStatuses);
    if (statuses.length === 0) return 0;
    const completed = statuses.filter(s => s === 'completed').length;
    return Math.round((completed / statuses.length) * 100);
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
          <p style={{ color: '#64748b', fontSize: 14 }}>Chargement...</p>
        </div>
        <style>{`.animate-spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
        padding: '20px 40px',
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
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 12,
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
                fontSize: 20,
                fontWeight: 800,
                color: '#1a365d',
                margin: 0,
              }}>Mes Roadmaps</h1>
              <p style={{
                fontSize: 12,
                color: '#64748b',
                margin: 0,
              }}>{roadmaps.length} roadmap{roadmaps.length > 1 ? 's' : ''} sauvegardé{roadmaps.length > 1 ? 's' : ''}</p>
            </div>
          </div>

          <button
            onClick={onCreateNew}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 20px',
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
            <PlusIcon />
            Nouveau Roadmap
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '40px',
      }}>
        {roadmaps.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '80px 40px',
            background: '#ffffff',
            borderRadius: 20,
            border: '1px solid #e2e8f0',
          }}>
            <div style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: '#f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              fontSize: 40,
            }}>
              🗺️
            </div>
            <h2 style={{
              fontSize: 20,
              fontWeight: 700,
              color: '#1a365d',
              marginBottom: 12,
            }}>Aucun roadmap sauvegardé</h2>
            <p style={{
              fontSize: 14,
              color: '#64748b',
              marginBottom: 24,
              maxWidth: 400,
              margin: '0 auto 24px',
            }}>
              Commencez par créer votre premier roadmap de certifications personnalisé.
            </p>
            <button
              onClick={onCreateNew}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '14px 28px',
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
              <PlusIcon />
              Créer mon roadmap
            </button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: 24,
          }}>
            {roadmaps.map((roadmap) => {
              const progress = calculateProgress(roadmap);
              const icon = PROFILE_ICONS[roadmap.profile] || '🎯';
              const label = PROFILE_LABELS[roadmap.profile] || roadmap.profile;

              return (
                <div
                  key={roadmap.id}
                  style={{
                    background: '#ffffff',
                    borderRadius: 16,
                    border: '1px solid #e2e8f0',
                    padding: 24,
                    transition: 'all 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
                  }}
                >
                  {/* Card Header */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    marginBottom: 16,
                  }}>
                    <div style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: 'linear-gradient(135deg, #2563EB15, #1d4ed815)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 24,
                    }}>
                      {icon}
                    </div>
                    <div style={{
                      display: 'flex',
                      gap: 8,
                    }}>
                      <button
                        onClick={() => handleDelete(roadmap.id)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: deleteConfirm === roadmap.id ? '1px solid #ef4444' : '1px solid #e2e8f0',
                          background: deleteConfirm === roadmap.id ? '#fee2e2' : 'transparent',
                          color: deleteConfirm === roadmap.id ? '#dc2626' : '#64748b',
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <TrashIcon />
                        {deleteConfirm === roadmap.id ? 'Confirmer?' : ''}
                      </button>
                    </div>
                  </div>

                  {/* Title & Info */}
                  <h3 style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: '#1a365d',
                    marginBottom: 8,
                    lineHeight: 1.4,
                  }}>
                    {roadmap.title}
                  </h3>

                  <div style={{
                    display: 'flex',
                    gap: 8,
                    marginBottom: 12,
                    flexWrap: 'wrap',
                  }}>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: 99,
                      background: '#f1f5f9',
                      color: '#64748b',
                      fontSize: 11,
                      fontWeight: 600,
                    }}>
                      {icon} {label}
                    </span>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: 99,
                      background: '#f1f5f9',
                      color: '#64748b',
                      fontSize: 11,
                      fontWeight: 600,
                    }}>
                      🏆 {roadmap.level}
                    </span>
                  </div>

                  {/* Stats */}
                  <div style={{
                    display: 'flex',
                    gap: 16,
                    marginBottom: 16,
                    paddingBottom: 16,
                    borderBottom: '1px solid #f1f5f9',
                  }}>
                    <div>
                      <div style={{
                        fontSize: 18,
                        fontWeight: 800,
                        color: '#2563EB',
                      }}>
                        {roadmap.roadmap.total_certifications}
                      </div>
                      <div style={{
                        fontSize: 11,
                        color: '#94a3b8',
                      }}>Certifications</div>
                    </div>
                    <div>
                      <div style={{
                        fontSize: 18,
                        fontWeight: 800,
                        color: '#2563EB',
                      }}>
                        {roadmap.roadmap.total_estimated_weeks}
                      </div>
                      <div style={{
                        fontSize: 11,
                        color: '#94a3b8',
                      }}>Semaines</div>
                    </div>
                    <div>
                      <div style={{
                        fontSize: 18,
                        fontWeight: 800,
                        color: progress > 0 ? '#059669' : '#94a3b8',
                      }}>
                        {progress}%
                      </div>
                      <div style={{
                        fontSize: 11,
                        color: '#94a3b8',
                      }}>Complété</div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {progress > 0 && (
                    <div style={{
                      height: 6,
                      background: '#f1f5f9',
                      borderRadius: 99,
                      marginBottom: 16,
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${progress}%`,
                        background: 'linear-gradient(90deg, #059669, #10b981)',
                        borderRadius: 99,
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                  )}

                  {/* Footer */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 12,
                      color: '#94a3b8',
                    }}>
                      <ClockIcon />
                      {formatDate(roadmap.createdAt)}
                    </div>

                    <button
                      onClick={() => onViewRoadmap(roadmap)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '10px 18px',
                        borderRadius: 8,
                        background: 'linear-gradient(135deg, #2563EB, #1d4ed8)',
                        border: 'none',
                        color: 'white',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
                      }}
                    >
                      Voir
                      <ArrowRightIcon />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

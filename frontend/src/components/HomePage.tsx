// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';

// ─── Inline SVG Icons ─────────────────────────────────────────────────────────

const CloudIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
  </svg>
);

const ShieldIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
    <path d="m9 12 2 2 4-4"/>
  </svg>
);

const BrainIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
  </svg>
);

const WifiIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
    <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
    <line x1="12" y1="20" x2="12.01" y2="20"/>
  </svg>
);

const ArrowRightIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/>
    <polyline points="12 5 19 12 12 19"/>
  </svg>
);

const SparklesIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const MapIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
    <line x1="9" y1="3" x2="9" y2="18"/>
    <line x1="15" y1="6" x2="15" y2="21"/>
  </svg>
);

const AwardIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="6"/>
    <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>
  </svg>
);

const TrendingIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
    <polyline points="16 7 22 7 22 13"/>
  </svg>
);

// ─── Domain Data ──────────────────────────────────────────────────────────────

const DOMAINS = [
  {
    key: 'cloud',
    label: 'Cloud & DevOps',
    description: 'AWS, Azure, GCP, Kubernetes, CI/CD et architecture cloud-native',
    icon: <CloudIcon />,
    color: '#2563EB',
    bgGradient: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
    border: 'rgba(37,99,235,0.2)',
    certifications: ['AZ-900', 'AWS SAA', 'GCP ACE'],
    emoji: '☁️',
  },
  {
    key: 'cyber',
    label: 'Cybersécurité',
    description: 'SIEM, pentest, SOC, gestion des incidents et conformité',
    icon: <ShieldIcon />,
    color: '#DC2626',
    bgGradient: 'linear-gradient(135deg, #FFF1F2 0%, #FFE4E6 100%)',
    border: 'rgba(220,38,38,0.2)',
    certifications: ['SC-900', 'CompTIA Sec+', 'CEH'],
    emoji: '🛡️',
  },
  {
    key: 'ai',
    label: 'Intelligence Artificielle',
    description: 'Machine learning, NLP, LLMs, MLOps et data science',
    icon: <BrainIcon />,
    color: '#7C3AED',
    bgGradient: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)',
    border: 'rgba(124,58,237,0.2)',
    certifications: ['AI-900', 'TF Dev', 'AWS MLS'],
    emoji: '🤖',
  },
  {
    key: 'iot',
    label: 'IoT & Systèmes',
    description: 'Microcontrôleurs, MQTT, Edge computing et systèmes embarqués',
    icon: <WifiIcon />,
    color: '#059669',
    bgGradient: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
    border: 'rgba(5,150,105,0.2)',
    certifications: ['AZ-220', 'AWS IoT', 'LPIC-1'],
    emoji: '📡',
  },
];

// ─── Feature pills ────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: <MapIcon />, text: 'Roadmap personnalisée' },
  { icon: <AwardIcon />, text: 'Certifications ciblées' },
  { icon: <TrendingIcon />, text: 'Progression adaptative' },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface HomePageProps {
  onStart: () => void;
}

export default function HomePage({ onStart }: HomePageProps) {
  const [hoveredDomain, setHoveredDomain] = useState<string | null>(null);
  const [hoveredBtn, setHoveredBtn] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#ffffff',
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      overflowX: 'hidden',
      position: 'relative',
    }}>

      {/* ── Ambient background blobs ───────────────────────────────────────── */}
      <div style={{
        position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0,
      }}>
        <div style={{
          position: 'absolute', top: '-10%', left: '20%',
          width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(37,99,235,0.08) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }} />
        <div style={{
          position: 'absolute', top: '40%', right: '-5%',
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(37,99,235,0.06) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }} />
        <div style={{
          position: 'absolute', bottom: '10%', left: '10%',
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(37,99,235,0.05) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }} />
      </div>

      {/* ── Hero Section ───────────────────────────────────────────────────── */}
      <div style={{
        position: 'relative', zIndex: 10,
        textAlign: 'center',
        padding: '72px 40px 56px',
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(24px)',
        transition: 'opacity 0.7s ease, transform 0.7s ease',
      }}>

        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 20px', borderRadius: 999,
          background: 'rgba(37,99,235,0.1)',
          border: '1px solid rgba(37,99,235,0.2)',
          marginBottom: 28,
        }}>
          <SparklesIcon />
          <span style={{ color: '#1d4ed8', fontSize: 13, fontWeight: 600 }}>
           · Multi-agent LangGraph
          </span>
        </div>

        {/* Main heading */}
        <h1 style={{
          fontSize: 'clamp(32px, 5vw, 60px)',
          fontWeight: 900,
          letterSpacing: '-1.5px',
          lineHeight: 1.1,
          margin: '0 0 20px',
          color: '#1a365d',
        }}>
          Votre Roadmap IT<br />Personnalisée
        </h1>

        {/* Subtitle */}
        <p style={{
          fontSize: 'clamp(15px, 2vw, 18px)',
          color: '#4a5568',
          maxWidth: 560,
          margin: '0 auto 40px',
          lineHeight: 1.7,
          fontWeight: 400,
        }}>
          Découvrez votre profil, identifiez vos lacunes et obtenez un plan de certifications
          sur mesure grâce à notre système d'évaluation adaptatif.
        </p>

        {/* CTA Button */}
        <button
          onClick={onStart}
          onMouseEnter={() => setHoveredBtn(true)}
          onMouseLeave={() => setHoveredBtn(false)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '16px 36px', borderRadius: 16,
            background: hoveredBtn
              ? 'linear-gradient(135deg, #1d4ed8 0%, #2563EB 100%)'
              : 'linear-gradient(135deg, #2563EB 0%, #1d4ed8 100%)',
            border: 'none', cursor: 'pointer',
            color: 'white', fontSize: 16, fontWeight: 700,
            letterSpacing: '-0.2px',
            boxShadow: hoveredBtn
              ? '0 0 40px rgba(37,99,235,0.4), 0 8px 24px rgba(0,0,0,0.15)'
              : '0 0 28px rgba(37,99,235,0.3), 0 4px 16px rgba(0,0,0,0.1)',
            transform: hoveredBtn ? 'translateY(-2px) scale(1.02)' : 'translateY(0) scale(1)',
            transition: 'all 0.25s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          <SparklesIcon />
          Commencer l'évaluation
          <ArrowRightIcon />
        </button>

        {/* Stats row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32,
          marginTop: 40, flexWrap: 'wrap',
        }}>
          {[
            { value: '40+', label: 'Questions d\'évaluation' },
            { value: '4', label: 'Domaines IT couverts' },
            { value: '30+', label: 'Certifications mappées' },
          ].map((stat, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: 26, fontWeight: 800, color: '#2563EB',
                letterSpacing: '-0.5px', lineHeight: 1,
              }}>{stat.value}</div>
              <div style={{ fontSize: 12, color: '#4a5568', marginTop: 4 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Domain Cards ───────────────────────────────────────────────────── */}
      <div style={{
        position: 'relative', zIndex: 10,
        padding: '0 40px 80px',
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(32px)',
        transition: 'opacity 0.8s ease 0.15s, transform 0.8s ease 0.15s',
      }}>
        <p style={{
          textAlign: 'center',
          color: '#2563EB',
          fontSize: 13, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.1em',
          marginBottom: 28,
        }}>
          Domaines couverts
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 20,
          maxWidth: 1080,
          margin: '0 auto',
        }}>
          {DOMAINS.map((domain, idx) => {
            const isHovered = hoveredDomain === domain.key;
            return (
              <div
                key={domain.key}
                onMouseEnter={() => setHoveredDomain(domain.key)}
                onMouseLeave={() => setHoveredDomain(null)}
                style={{
                  borderRadius: 20,
                  padding: '24px 22px',
                  background: isHovered
                    ? '#ffffff'
                    : '#f8fafc',
                  border: isHovered
                    ? `1px solid ${domain.color}40`
                    : '1px solid #e2e8f0',
                  cursor: 'default',
                  transition: 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)',
                  transform: isHovered ? 'translateY(-6px)' : 'translateY(0)',
                  boxShadow: isHovered
                    ? `0 20px 40px rgba(0,0,0,0.1), 0 0 0 1px ${domain.color}20`
                    : '0 4px 12px rgba(0,0,0,0.05)',
                  animationDelay: `${idx * 0.08}s`,
                }}
              >
                {/* Icon + Emoji */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 14,
                    background: isHovered ? domain.bgGradient : '#f1f5f9',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: isHovered ? domain.color : '#64748b',
                    transition: 'all 0.3s ease',
                    boxShadow: isHovered ? `0 4px 16px ${domain.color}30` : 'none',
                  }}>
                    {domain.icon}
                  </div>
                  <span style={{ fontSize: 28 }}>{domain.emoji}</span>
                </div>

                {/* Title */}
                <h3 style={{
                  fontSize: 16, fontWeight: 700,
                  color: isHovered ? '#1a365d' : '#2d3748',
                  margin: '0 0 8px', letterSpacing: '-0.3px',
                  transition: 'color 0.2s',
                }}>
                  {domain.label}
                </h3>

                {/* Description */}
                <p style={{
                  fontSize: 13, lineHeight: 1.6,
                  color: isHovered ? '#4a5568' : '#64748b',
                  margin: '0 0 16px',
                  transition: 'color 0.2s',
                }}>
                  {domain.description}
                </p>

                {/* Cert pills */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {domain.certifications.map((cert, ci) => (
                    <span key={ci} style={{
                      fontSize: 11, fontWeight: 600,
                      padding: '3px 10px', borderRadius: 999,
                      background: isHovered ? `${domain.color}15` : '#f1f5f9',
                      border: isHovered ? `1px solid ${domain.color}30` : '1px solid #e2e8f0',
                      color: isHovered ? domain.color : '#64748b',
                      transition: 'all 0.25s ease',
                    }}>
                      {cert}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <div style={{
        position: 'relative', zIndex: 10,
        padding: '0 40px 80px',
        opacity: mounted ? 1 : 0,
        transition: 'opacity 0.9s ease 0.3s',
      }}>
        <div style={{
          maxWidth: 760, margin: '0 auto',
          borderRadius: 24,
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          padding: '36px 40px',
        }}>
          <p style={{
            textAlign: 'center',
            color: '#2563EB',
            fontSize: 12, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.12em',
            marginBottom: 28,
          }}>
            Comment ça fonctionne
          </p>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24,
          }}>
            {[
              {
                step: '01',
                title: 'Évaluation',
                desc: '40 questions adaptatives pour analyser vos compétences en Cloud, Cyber, IA et IoT',
                color: '#2563EB',
              },
              {
                step: '02',
                title: 'Diagnostic de niveau',
                desc: '10 questions techniques pour estimer précisément votre niveau actuel dans votre domaine',
                color: '#1d4ed8',
              },
              {
                step: '03',
                title: 'Roadmap IA',
                desc: 'Votre plan de certifications personnalisé généré par nos agents LangGraph en temps réel',
                color: '#2563EB',
              },
            ].map((s) => (
              <div key={s.step} style={{ textAlign: 'center' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, margin: '0 auto 14px',
                  background: `${s.color}15`,
                  border: `1px solid ${s.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 800, color: s.color,
                  letterSpacing: '-0.3px',
                }}>
                  {s.step}
                </div>
                <h4 style={{
                  fontSize: 15, fontWeight: 700, color: '#1a365d',
                  margin: '0 0 8px', letterSpacing: '-0.2px',
                }}>
                  {s.title}
                </h4>
                <p style={{
                  fontSize: 12, color: '#64748b', lineHeight: 1.6, margin: 0,
                }}>
                  {s.desc}
                </p>
              </div>
            ))}
          </div>

          {/* Bottom CTA */}
          <div style={{ textAlign: 'center', marginTop: 36 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 16px', borderRadius: 999,
              background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.15)',
              marginBottom: 20,
            }}>
              {[
                'Gratuit', 'Sans inscription', 'Résultats en 2 min'
              ].map((t, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span style={{ color: 'rgba(37,99,235,0.3)', fontSize: 12 }}>·</span>}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#1d4ed8', fontSize: 12 }}>
                    <span style={{ color: '#2563EB' }}><CheckIcon /></span>
                    {t}
                  </span>
                </React.Fragment>
              ))}
            </div>

            <button
              onClick={onStart}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '14px 32px', borderRadius: 14, margin: '0 auto',
                background: 'linear-gradient(135deg, #2563EB 0%, #1d4ed8 100%)',
                border: 'none', cursor: 'pointer',
                color: 'white', fontSize: 15, fontWeight: 700,
                boxShadow: '0 4px 20px rgba(37,99,235,0.35)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 28px rgba(37,99,235,0.4)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 20px rgba(37,99,235,0.35)';
              }}
            >
              <SparklesIcon />
              Démarrer maintenant
              <ArrowRightIcon />
            </button>
          </div>
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer style={{
        position: 'relative', zIndex: 10,
        borderTop: '1px solid #e2e8f0',
        padding: '20px 40px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          color: '#64748b', fontSize: 13,
        }}>
          <span style={{
            width: 24, height: 24, borderRadius: 7,
            background: 'linear-gradient(135deg, #2563EB, #1d4ed8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 900, color: 'white',
          }}>S</span>
          <span>Subul · سُبُل</span>
        </div>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>
          Votre guide vers la certification IT
        </span>
      </footer>

      {/* ── CSS Animations ─────────────────────────────────────────────────── */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow-x: hidden; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #f1f5f9; }
        ::-webkit-scrollbar-thumb { background: rgba(37,99,235,0.4); border-radius: 3px; }
      `}</style>
    </div>
  );
}

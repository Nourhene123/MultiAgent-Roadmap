/**
 * Subul Design System
 * Soft, modern, animated UI with glassmorphism effects
 */

export const colors = {
  // Primary soft palette
  primary: {
    50: '#f5f3ff',
    100: '#ede9fe',
    200: '#ddd6fe',
    300: '#c4b5fd',
    400: '#a78bfa',
    500: '#8b5cf6',
    600: '#7c3aed',
    700: '#6d28d9',
    800: '#5b21b6',
    900: '#4c1d95',
  },
  // Soft secondary
  secondary: {
    cloud: '#60a5fa',
    cyber: '#f87171',
    ai: '#a78bfa',
    iot: '#34d399',
  },
  // Neutral soft grays
  gray: {
    50: '#fafafa',
    100: '#f4f4f5',
    200: '#e4e4e7',
    300: '#d4d4d8',
    400: '#a1a1aa',
    500: '#71717a',
    600: '#52525b',
    700: '#3f3f46',
    800: '#27272a',
    900: '#18181b',
  },
  // Semantic
  success: '#86efac',
  warning: '#fde047',
  error: '#fca5a5',
  info: '#93c5fd',
};

export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  DEFAULT: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  glass: '0 8px 32px rgba(0, 0, 0, 0.08)',
  glow: '0 0 40px rgba(139, 92, 246, 0.15)',
};

export const animations = {
  // Fade in
  fadeIn: {
    from: { opacity: 0 },
    to: { opacity: 1 },
  },
  // Slide up
  slideUp: {
    from: { opacity: 0, transform: 'translateY(20px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
  },
  // Slide in from right
  slideInRight: {
    from: { opacity: 0, transform: 'translateX(20px)' },
    to: { opacity: 1, transform: 'translateX(0)' },
  },
  // Scale in
  scaleIn: {
    from: { opacity: 0, transform: 'scale(0.95)' },
    to: { opacity: 1, transform: 'scale(1)' },
  },
  // Bounce soft
  bounceSoft: {
    '0%, 100%': { transform: 'translateY(0)' },
    '50%': { transform: 'translateY(-5px)' },
  },
  // Pulse glow
  pulseGlow: {
    '0%, 100%': { boxShadow: '0 0 20px rgba(139, 92, 246, 0.2)' },
    '50%': { boxShadow: '0 0 40px rgba(139, 92, 246, 0.4)' },
  },
  // Shimmer
  shimmer: {
    '0%': { backgroundPosition: '-200% 0' },
    '100%': { backgroundPosition: '200% 0' },
  },
  // Float
  float: {
    '0%, 100%': { transform: 'translateY(0px)' },
    '50%': { transform: 'translateY(-10px)' },
  },
  // Spin slow
  spinSlow: {
    from: { transform: 'rotate(0deg)' },
    to: { transform: 'rotate(360deg)' },
  },
};

export const transitions = {
  fast: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
  DEFAULT: 'all 250ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: 'all 350ms cubic-bezier(0.4, 0, 0.2, 1)',
  spring: 'all 500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  bounce: 'all 300ms cubic-bezier(0.68, -0.55, 0.265, 1.55)',
};

export const glass = {
  light: {
    background: 'rgba(255, 255, 255, 0.7)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.5)',
  },
  medium: {
    background: 'rgba(255, 255, 255, 0.5)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
  },
  dark: {
    background: 'rgba(0, 0, 0, 0.3)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
};

export const gradients = {
  // Soft background gradients
  soft: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 50%, #ddd6fe 100%)',
  softWarm: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fcd34d 100%)',
  softCool: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 50%, #7dd3fc 100%)',
  softRose: 'linear-gradient(135deg, #ffe4e6 0%, #fecdd3 50%, #fda4af 100%)',
  softMint: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 50%, #6ee7b7 100%)',
  
  // Primary action gradients
  primary: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #6d28d9 100%)',
  primarySoft: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 50%, #7c3aed 100%)',
  
  // Hero background
  hero: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #8b5cf6 100%)',
  heroSoft: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 50%, #c4b5fd 100%)',
  
  // Aurora effect
  aurora: 'linear-gradient(135deg, #667eea 0%, #764ba2 25%, #8b5cf6 50%, #a78bfa 75%, #c4b5fd 100%)',
};

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

export const spacing = {
  0: '0',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
};

export const borderRadius = {
  none: '0',
  sm: '0.375rem',
  DEFAULT: '0.5rem',
  md: '0.75rem',
  lg: '1rem',
  xl: '1.5rem',
  '2xl': '2rem',
  full: '9999px',
};

// Common component styles
export const styles = {
  // Card
  card: {
    ...glass.light,
    borderRadius: borderRadius.xl,
    padding: spacing[6],
    boxShadow: shadows.glass,
    transition: transitions.DEFAULT,
  },
  cardHover: {
    transform: 'translateY(-4px)',
    boxShadow: shadows.xl,
  },
  
  // Button primary
  buttonPrimary: {
    padding: `${spacing[4]} ${spacing[8]}`,
    fontSize: '1rem',
    fontWeight: 600,
    borderRadius: borderRadius.xl,
    background: gradients.primary,
    color: 'white',
    border: 'none',
    cursor: 'pointer',
    boxShadow: shadows.md,
    transition: transitions.spring,
  },
  buttonPrimaryHover: {
    transform: 'translateY(-2px) scale(1.02)',
    boxShadow: shadows.lg,
  },
  
  // Button secondary
  buttonSecondary: {
    padding: `${spacing[3]} ${spacing[6]}`,
    fontSize: '0.875rem',
    fontWeight: 600,
    borderRadius: borderRadius.lg,
    ...glass.light,
    color: colors.gray[700],
    cursor: 'pointer',
    transition: transitions.DEFAULT,
  },
  buttonSecondaryHover: {
    ...glass.medium,
    transform: 'translateY(-1px)',
  },
  
  // Modal
  modal: {
    ...glass.light,
    borderRadius: borderRadius['2xl'],
    boxShadow: shadows['2xl'],
    animation: 'scaleIn 300ms ease-out',
  },
  
  // Input
  input: {
    padding: `${spacing[3]} ${spacing[4]}`,
    fontSize: '0.875rem',
    borderRadius: borderRadius.lg,
    border: `1px solid ${colors.gray[200]}`,
    background: 'white',
    transition: transitions.fast,
    outline: 'none',
  },
  inputFocus: {
    borderColor: colors.primary[400],
    boxShadow: `0 0 0 3px ${colors.primary[100]}`,
  },
  
  // Badge
  badge: {
    padding: `${spacing[1]} ${spacing[3]}`,
    fontSize: '0.75rem',
    fontWeight: 600,
    borderRadius: borderRadius.full,
    ...glass.light,
  },
  
  // Progress bar
  progressBar: {
    height: '0.5rem',
    background: colors.gray[200],
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
    transition: 'width 500ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
};

// Animation keyframes as CSS string for injection
export const keyframesCSS = `
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slideInRight {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes bounceSoft {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

@keyframes pulseGlow {
  0%, 100% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.2); }
  50% { box-shadow: 0 0 40px rgba(139, 92, 246, 0.4); }
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
}

@keyframes spinSlow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes gradientShift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

@keyframes wave {
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(0.6); }
}
`;

export default {
  colors,
  shadows,
  animations,
  transitions,
  glass,
  gradients,
  breakpoints,
  spacing,
  borderRadius,
  styles,
  keyframesCSS,
};

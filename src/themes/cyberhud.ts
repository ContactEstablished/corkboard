import type { ThemeDefinition } from './types'

/**
 * CyberHUD — the default futuristic theme.
 * Hex values come from the design brief; derived values (glows, halos) are
 * expressed as full colors so components never hand-roll rgba() values.
 */
export const cyberHud: ThemeDefinition = {
  id: 'cyberhud',
  label: 'CyberHUD',
  description: 'Default · Futuristic',
  tokens: {
    // surfaces
    'bg': '#03111F',
    'bg-deep': '#020B14',
    'panel': '#061B2D',
    'surface': '#0A253A',
    'surface-hover': '#0E3150',
    'scrim': 'rgba(1, 8, 16, 0.72)',

    // brand
    'primary': '#00D9FF',
    'primary-contrast': '#021623',
    'blue': '#238BFF',
    'blue-deep': '#1163C9',
    'border': '#14617D',
    'border-bright': '#1B9BC0',

    // text
    'text': '#EAF8FF',
    'text-dim': '#91B5CC',
    'text-faint': '#5F8399',

    // status
    'success': '#2EE6A6',
    'warning': '#FFC233',
    'danger': '#FF5D73',

    // effects
    'glow': '#00D9FF',
    'glow-strength': '0.55',
    'grid-line': 'rgba(0, 217, 255, 0.045)',

    // member accents (AccentKey → color)
    'accent-blue': '#3B93FF',
    'accent-magenta': '#FF3DAE',
    'accent-teal': '#19E6B0',
    'accent-amber': '#F2B33D',
    'accent-violet': '#A25BFF',

    // type
    'font-display': "'Orbitron Variable', 'Orbitron', system-ui, sans-serif",
    'font-body': "'Inter Variable', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",

    // shape
    'chamfer': '0.9rem',
    'radius': '0.6rem',
    'touch-min': '3.25rem',
  },
}

/** Every token a theme must provide. Components consume them as `var(--hud-<name>)`. */
export const TOKEN_NAMES = [
  'bg', 'bg-deep', 'panel', 'surface', 'surface-hover', 'scrim',
  'primary', 'primary-contrast', 'blue', 'blue-deep', 'border', 'border-bright',
  'text', 'text-dim', 'text-faint',
  'success', 'warning', 'danger',
  'glow', 'glow-strength', 'grid-line',
  'accent-blue', 'accent-magenta', 'accent-teal', 'accent-amber', 'accent-violet',
  'font-display', 'font-body',
  'chamfer', 'radius', 'touch-min',
] as const

export type TokenName = (typeof TOKEN_NAMES)[number]

export interface ThemeDefinition {
  id: string
  label: string
  description: string
  tokens: Record<TokenName, string>
}

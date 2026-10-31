import { cyberHud } from './cyberhud'
import type { ThemeDefinition } from './types'

export type { ThemeDefinition, TokenName } from './types'
export { TOKEN_NAMES } from './types'

/** Registry of available themes. Add new themes here; nothing else changes. */
export const themes: Record<string, ThemeDefinition> = {
  [cyberHud.id]: cyberHud,
}

export const DEFAULT_THEME_ID = cyberHud.id

/** Writes a theme's tokens to `:root` as `--hud-*` custom properties. */
export function applyTheme(theme: ThemeDefinition, root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(`--hud-${name}`, value)
  }
  root.dataset.theme = theme.id
}

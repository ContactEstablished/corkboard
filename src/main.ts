import '@fontsource-variable/inter'
import '@fontsource-variable/orbitron'
import 'vuetify/styles'
import './themes/base.scss'

import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { createVuetify } from 'vuetify'
import { VApp } from 'vuetify/components/VApp'
import App from './app/App.vue'
import { createAppNavigator } from './app/navigator'
import { router } from './app/router'
import { loadAllStores } from './stores/bootstrap'
import { type SpeechProvider, createMockServices, getServices, setServices } from './services/container'
import { localStoragePersistence } from './services/mock/persistence'
import { DEFAULT_THEME_ID, applyTheme, themes } from './themes'
import { toISODate } from './utils/date'

// Theme first, so the first paint is already CyberHUD.
const theme = themes[DEFAULT_THEME_ID]!
applyTheme(theme)

// `?speech=browser` switches from the scripted mock to the Web Speech API.
const params = new URLSearchParams(location.search)
const speech = (params.get('speech') ?? import.meta.env.VITE_SPEECH_PROVIDER ?? 'mock') as SpeechProvider
const persist = params.get('persist') !== '0' && import.meta.env.VITE_PERSIST !== '0'

setServices(
  createMockServices({
    speech,
    // Demo seed data is relative to "today", so the namespace rolls over daily.
    persistence: persist ? localStoragePersistence(`familyhub.v1.${toISODate(new Date())}`) : undefined,
  }),
)

// Voice "show me…" commands drive the router through this adapter.
getServices().navigation = createAppNavigator(router)

const vuetify = createVuetify({
  components: { VApp },
  theme: {
    defaultTheme: 'cyberhud',
    themes: {
      cyberhud: {
        dark: true,
        colors: {
          'background': theme.tokens.bg,
          'surface': theme.tokens.panel,
          'primary': theme.tokens.primary,
          'secondary': theme.tokens.blue,
          'error': theme.tokens.danger,
          'success': theme.tokens.success,
          'warning': theme.tokens.warning,
        },
      },
    },
  },
})

const app = createApp(App)
app.use(createPinia()).use(router).use(vuetify)

// Stores need the Pinia instance, so load after `use(pinia)`; the UI renders
// as soon as the data arrives (it's local, so this is effectively instant).
loadAllStores().finally(() => {
  app.mount('#app')
})

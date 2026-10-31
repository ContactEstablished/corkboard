import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  css: {
    preprocessorOptions: {
      scss: { additionalData: '@use "themes/mixins" as *;', loadPaths: [fileURLToPath(new URL('./src', import.meta.url))] },
    },
  },
  server: { host: true, port: 5173 },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.spec.ts'],
    globals: false,
    css: false,
  },
})

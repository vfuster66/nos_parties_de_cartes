import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Sous GitHub Pages l'application est servie dans /<nom-du-dépôt>/ : le workflow fournit BASE_PATH.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'Nos parties de cartes',
        short_name: 'Cartes',
        description: 'Compteur de points pour la coinche, la belote et le tarot',
        lang: 'fr',
        id: base,
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#0f766e',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'], navigateFallback: 'index.html' },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// O otimizador do FSRS usa threads no wasm, que exigem isolamento de origem.
// Com as fontes auto-hospedadas, ligar isso não quebra mais nada.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  server: { headers: isolation },
  preview: { headers: isolation },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['fsrs-browser'] },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Cadence — inglês por frases',
        short_name: 'Cadence',
        description: 'Repetição espaçada com áudio nativo para estudo de inglês.',
        theme_color: '#14142B',
        background_color: '#14142B',
        display: 'standalone',
        start_url: '/',
      },
      workbox: {
        // /api/* nunca é cacheado: sempre rede, com erro tratado na UI.
        navigateFallbackDenylist: [/^\/api/],
        // O wasm do sql.js só serve para importar do Anki: fica fora do
        // precache para não pesar na instalação do PWA.
        // Fora do precache: só quem importa do Anki ou abre o progresso baixa.
        globIgnores: [
          '**/*.wasm',
          '**/ankiImport-*.js',
          '**/Progress-*.js',
          '**/optimizer*',
          '**/workerHelpers*',
          // Só o subconjunto latino é usado por um app de português e inglês.
          '**/*-{vietnamese,cyrillic,cyrillic-ext,greek,greek-ext}-*.woff2',
        ],
        maximumFileSizeToCacheInBytes: 3_000_000,
      },
    }),
  ],
})

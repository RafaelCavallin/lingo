import { defineConfig } from 'vitest/config'
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
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      // A camada de UI (screens/components React, contexts) fica fora do gate:
      // ela é validada por e2e no Playwright, não por cobertura de unidade.
      include: ['src/services/**/*.ts', 'src/components/textMarks.ts', 'src/components/restoreConfirm.ts'],
      exclude: ['**/*.test.ts'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
      reporter: ['text', 'html'],
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Lingo — inglês por frases',
        short_name: 'Lingo',
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
        // precache para não pesar na instalação do PWA. O JSZip, ao contrário,
        // fica dentro: backup e restauração têm de funcionar offline, e um
        // chunk ausente do precache exigiria rede na primeira vez.
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

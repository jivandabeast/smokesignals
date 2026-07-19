import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        swSrc: 'src/sw.ts',
        swDest: 'dist/sw.js',
      },
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: 'SmokeSignals',
        short_name: 'SmokeSignals',
        description: 'Share the moment. Call your circle.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    watch: { usePolling: true },
    proxy: {
      '/api': { target: process.env.VITE_API_TARGET || 'http://backend:8000', changeOrigin: true },
      '/uploads': { target: process.env.VITE_API_TARGET || 'http://backend:8000', changeOrigin: true },
    },
  },
  optimizeDeps: {
    include: ['leaflet', 'leaflet.markercluster/dist/leaflet.markercluster-src.js'],
  },
})

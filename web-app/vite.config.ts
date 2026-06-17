import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Единый экземпляр для каждого из этих пакетов во всём бандле
    dedupe: ['react', 'react-dom', 'three'],
  },
  optimizeDeps: {
    // manifold-3d: WASM, не трогаем esbuild-ом
    // three/examples/jsm: намеренно НЕ включаем сюда, иначе esbuild встроит
    // свою копию three внутрь чанка и получим два экземпляра Object3D
    exclude: ['manifold-3d'],
    include: ['react', 'react-dom', 'zustand', 'three'],
  },
  worker: {
    format: 'es',
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})

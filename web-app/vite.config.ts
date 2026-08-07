// @ts-nocheck
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// FIX: Перехватываем ВСЕ HTTP-ответы Vite dev-сервера и удаляем @react-refresh.
// @vitejs/plugin-react внедряет @react-refresh в бандл воркера через Rollup pipeline,
// который НЕ проходит через transform hook. Middleware перехватывает готовый HTTP-ответ.
// Используем stack.unshift() чтобы middleware сработал ДО встроенных middleware Vite.
const stripReactRefresh = {
  name: 'strip-react-refresh',
  configureServer(server) {
    return () => {
      const handler = (req, res, next) => {
        const isText = req.url?.includes('.js') ||
          req.url?.includes('@react-refresh') ||
          req.url?.includes('@vite/client')

        if (!isText) return next()

        const chunks = []
        const originalWrite = res.write.bind(res)
        const originalEnd = res.end.bind(res)

        res.write = (chunk) => {
          chunks.push(Buffer.from(typeof chunk === 'string' ? chunk : chunk))
          return true
        }

        res.end = (chunk) => {
          if (chunk) chunks.push(Buffer.from(typeof chunk === 'string' ? chunk : chunk))
          let body = Buffer.concat(chunks).toString('utf-8')

          if (body.includes('@react-refresh')) {
            body = body.replace(/import\s*{[^}]*}\s*from\s*['"]@react-refresh['"].*$/gm, '')
            body = body.replace(/if\s*\(import\.meta\.hot\)[^{]*\{[^}]*(?:\{[^}]*\}[^}]*)*\}/g, '')
            body = body.replace(/__vite__HMR\b/g, '')
            body = body.replace(/@react-refresh\b/g, '')
            body = body.replace(/.*@react-refresh.*\n/g, '')
          }

          res.setHeader('Content-Length', Buffer.byteLength(body))
          originalWrite(body)
          originalEnd()
        }

        return next()
      }

      // Добавляем В НАЧАЛО chain — ДО встроенных middleware Vite
      server.middlewares.stack.unshift({ route: '', handler })
    }
  },
}

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  plugins: [
    stripReactRefresh,
    react({
      // FIX: Исключаем воркер из обработки React Refresh
      exclude: /.worker.(js|ts)$/,
    }),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', 'three'],
  },
  optimizeDeps: {
    exclude: ['manifold-3d'],
    include: ['react', 'react-dom', 'zustand', 'three'],
  },
  worker: {
    format: 'es',
    plugins: () => [],
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    hmr: {
      overlay: false,
    },
  },
})

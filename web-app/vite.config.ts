// @ts-nocheck
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// ─── Yandex SDK Plugin ───────────────────────────────────────────
// Вставляет SDK в НАЧАЛО <head>, ДО кода приложения.
// Синхронная загрузка (без async) — SDK обязан быть готов до app code.
// ✅ Путь: /sdk.js (требование Яндекса п. 1.1)
const yandexSdkPlugin = (): Plugin => ({
  name: 'vite-plugin-yandex-sdk',
  transformIndexHtml(html, ctx) {
    const isYandex = process.env.VITE_PLATFORM === 'yandex' || ctx?.mode === 'yandex'
    if (isYandex) {
      // Вставляем SDK ПЕРВЫМ в <head>, до всех остальных скриптов
      return html.replace(
        '<head>',
        '<head>\n    <!-- Yandex Games SDK (п. 1.1) — загружается синхронно ДО app code -->\n' +
        '    <script src="/sdk.js"><\/script>'
      )
    }
    return html
  },
})

// ─── Strip React Refresh (HMR fix) ──────────────────────────────
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
          // FIX: Защита от ERR_HTTP_HEADERS_SENT — Vite 6.4 может вызвать
          // res.end() повторно (например, после ошибки или для 404).
          if (res.writableEnded || res.headersSent) return
          if (chunk) chunks.push(Buffer.from(typeof chunk === 'string' ? chunk : chunk))
          let body = Buffer.concat(chunks).toString('utf-8')

          if (body.includes('@react-refresh')) {
            body = body.replace(/import\s*{[^}]*}\s*from\s*['"]@react-refresh['"].*$/gm, '')
            body = body.replace(/if\s*\(import\.meta\.hot\)[^{]*\{[^}]*(?:\{[^}]*\}[^}]*)*\}/g, '')
            body = body.replace(/__vite__HMR\b/g, '')
            body = body.replace(/@react-refresh\b/g, '')
            body = body.replace(/.*@react-refresh.*\n/g, '')
          }

          try {
            res.setHeader('Content-Length', Buffer.byteLength(body))
            originalWrite(body)
            originalEnd()
          } catch {
            // Заголовки уже отправлены — игнорируем
          }
        }

        return next()
      }

      server.middlewares.stack.unshift({ route: '', handle: handler })
    }
  },
}

// ─── Main config ─────────────────────────────────────────────────
const isYandex = process.env.VITE_PLATFORM === 'yandex'

export default defineConfig(({ mode }) => {
  const yandex = mode === 'yandex' || isYandex
  return {
    base: yandex ? '/' : '/tinkercraft/',
    define: {
      __PLATFORM__: JSON.stringify(yandex ? 'yandex' : 'clean'),
    },
    build: {
      outDir: yandex ? 'dist-yandex' : 'dist',
      emptyOutDir: true,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
    plugins: [
      react({
        exclude: /.worker.(js|ts)$/,
      }),
      yandexSdkPlugin(),
      stripReactRefresh,
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
      // COEP/COOP нужны только для clean-версии (WebAssembly SharedArrayBuffer)
      // Для yandex-версии эти заголовки блокируют загрузку SDK с yandex.ru
      headers: isYandex
        ? undefined
        : {
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
        },
      hmr: {
        overlay: false,
      },
    },
  }
})

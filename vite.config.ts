import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(pbs|video)\.twimg\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'twitter-media-cache',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /\/api\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 }
            }
          }
        ]
      },
      manifest: {
        name: 'unbird',
        short_name: 'unbird',
        description: 'Privacy-respecting X/Twitter frontend',
        theme_color: '#000000',
        icons: [
          {
            src: '/logo.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          }
        ]
      }
    }),
  ],
  root: ".",
  publicDir: "public",
  server: {
    port: 5173,
    // Proxy API requests to the Hono server
    proxy: {
      "/api": {
        target: "http://localhost:3069",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": "/src",
      "@server": "/src/server",
      "@web": "/src/web",
    },
  },
});

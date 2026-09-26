import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    fs: {
      // Allow serving files from the linked iTwin.js source packages (repo root)
      allow: ['..', '../..'],
    },
    proxy: {
      // Auth endpoints
      '/auth': {
        // imodelhub-services owns the auth surface (email/login, refresh, logout).
        // modeling-server only serves /api/users/* and /api/auth/* forwarding routes.
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      // iTwin Platform API endpoints (SDK-compatible)
      // bypass HTML navigation requests so React Router handles /itwins/* page routes
      '/itwins': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
        bypass: (req) => {
          if (req.headers['accept']?.includes('text/html')) return '/index.html';
        },
      },
      '/imodels': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      '/accesscontrol': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      '/webhooks': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      '/users': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      // OIDC/OAuth endpoints
      '/.well-known': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      '/oauth': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      // File uploads
      '/files': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      // Azurite blob storage (for baseline file upload)
      '/azurite': {
        target: 'http://localhost:10000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/azurite/, ''),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            // Forward Azure-specific headers
            const azureHeaders = ['x-ms-blob-type', 'x-ms-version', 'x-ms-date'];
            azureHeaders.forEach((header) => {
              const value = req.headers[header];
              if (value) {
                proxyReq.setHeader(header, value);
              }
            });
          });
        },
      },
    },
  },
  optimizeDeps: {
    // Pre-bundle these dependencies for faster dev server startup
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      '@itwin/itwinui-react',
      '@itwin/itwinui-icons-react',
    ],
    exclude: [
      '@itwin/core-frontend',
      '@itwin/core-common',
      '@itwin/core-bentley',
      '@itwin/core-geometry',
      '@itwin/editor-frontend',
    ],
  },
  css: {
    preprocessorOptions: {
      scss: {
        loadPaths: ['node_modules'],
        importer: [
          // Handle ~@itwin/ imports in SCSS files
          {
            findFileUrl(url) {
              if (url.startsWith('~@itwin/')) {
                const resolved = url.slice(1);
                return new URL(`file://${resolved}`);
              }
              return null;
            },
          },
        ],
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
      '@app': '/app',
      '@features': '/features',
      '@shared': '/shared',
      '@pages': '/src/pages',
      '@styles': '/styles',
    },
    dedupe: [
      '@itwin/core-frontend',
      '@itwin/core-common',
      '@itwin/core-bentley',
      '@itwin/core-geometry',
      '@itwin/editor-frontend',
    ],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Vite's default es2020 target rejects destructuring emitted by newer TS output;
    // the app targets current evergreen browsers.
    target: 'es2022',
    // Code splitting optimization
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching
        manualChunks: {
          // Vendor chunks - third-party libraries that change less frequently
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-itwin-ui': ['@itwin/itwinui-react', '@itwin/itwinui-icons-react'],
          'vendor-itwin-core': [
            '@itwin/core-frontend',
            '@itwin/core-common',
            '@itwin/core-bentley',
            '@itwin/core-geometry',
          ],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-auth': ['@itwin/browser-authorization'],
        },
        // Ensure chunks are not too small (avoid too many HTTP requests)
        experimentalMinChunkSize: 10000, // 10KB
      },
    },
    // Chunk size warning limit
    chunkSizeWarningLimit: 500, // 500KB
  },
  preview: {
    port: 4173,
    proxy: {
      '/auth': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      '/itwins': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      '/imodels': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      '/accesscontrol': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      '/webhooks': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      '/users': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      '/.well-known': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      '/oauth': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      '/files': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})

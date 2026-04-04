import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'
import path from 'path'

export default defineConfig(({ mode }) => {
  // Load environment variables from .env files
  const env = loadEnv(mode, process.cwd(), '');
  const isLab = process.env.VITE_APP_TARGET === 'lab';
  const outDir = isLab ? 'lab' : 'support';

  // Select the appropriate client ID based on build target
  const clientId = isLab 
    ? env.VITE_LAB_CLIENT_ID 
    : env.VITE_SUPPORT_CLIENT_ID;

  const dynamicManifest = {
    ...manifest,
    name: isLab ? "ParaNote Lab" : "ParaNote Support",
    description: isLab 
      ? "Troubleshooting and resolution annotations for the LabLabee team." 
      : manifest.description,
    oauth2: {
      ...manifest.oauth2,
      // Fallback to manifest default if .env is missing
      client_id: clientId || manifest.oauth2.client_id
    }
  };

  return {
    plugins: [
      react(),
      crx({ manifest: dynamicManifest }),
    ],
    build: {
      outDir: outDir,
      emptyOutDir: true
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5173,
      origin: 'http://localhost:5173',
      strictPort: true,
      hmr: {
        port: 5173,
      },
      cors: {
        origin: '*',
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
        credentials: true,
      },
    },
  };
})

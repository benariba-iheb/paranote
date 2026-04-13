import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isLab = process.env.VITE_APP_TARGET === 'lab';
  const outDir = isLab ? 'lab' : 'support';

  const dynamicManifest = {
    ...manifest,
    name: isLab ? "ParaNote Lab" : "ParaNote Support",
    description: isLab 
      ? "Troubleshooting and resolution annotations for the LabLabee team." 
      : manifest.description,
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

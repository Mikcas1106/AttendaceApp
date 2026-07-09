import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isCapacitor = mode === 'capacitor'
  const isElectron = mode === 'electron'
  const useRelativeBase = isCapacitor || isElectron

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    // Firebase Hosting SPA uses absolute paths; Capacitor/Electron need relative paths.
    base: useRelativeBase ? './' : '/',
    publicDir: 'static',
    build: {
      outDir: isCapacitor ? 'public' : 'dist',
      emptyOutDir: true,
    },
  }
})

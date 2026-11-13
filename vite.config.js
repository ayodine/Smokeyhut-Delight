import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const redesignMode = env.REDESIGN_MODE === 'true' || env.VITE_REDESIGN_MODE === 'true'

  return {
    plugins: [react()],
    define: {
      __REDESIGN_MODE__: JSON.stringify(redesignMode),
      'import.meta.env.REDESIGN_MODE': JSON.stringify(env.REDESIGN_MODE ?? ''),
      'import.meta.env.VITE_REDESIGN_MODE': JSON.stringify(
        env.VITE_REDESIGN_MODE ?? (redesignMode ? 'true' : '')
      ),
    },
    build: {
      chunkSizeWarningLimit: 1600,
    },
  }
})

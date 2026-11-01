import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the same build works under /yodo/ (GitHub Pages)
  // and / (self-hosted); see ADR 0007.
  base: './',
  plugins: [react()],
})

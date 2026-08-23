import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Pinned, and strictly so. MSAL sends the browser back to window.location.origin, which has to
    // match a redirect URI registered on the SPA app - so a dev server that quietly picks the next
    // free port when 5173 is busy breaks sign-in with AADSTS50011 and no obvious cause. Better to
    // fail with "port in use" than to start on an address Entra doesn't know.
    port: 5199,
    strictPort: true,
  },
})

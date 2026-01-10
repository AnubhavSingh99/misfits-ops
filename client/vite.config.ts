import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// Generate build version: YYMMDD-HHMM format in IST (UTC+5:30)
const now = new Date()
const istOffset = 5.5 * 60 * 60 * 1000 // IST is UTC+5:30
const istDate = new Date(now.getTime() + istOffset)
const buildVersion = `${istDate.getUTCFullYear().toString().slice(2)}${(istDate.getUTCMonth() + 1).toString().padStart(2, '0')}${istDate.getUTCDate().toString().padStart(2, '0')}-${istDate.getUTCHours().toString().padStart(2, '0')}${istDate.getUTCMinutes().toString().padStart(2, '0')}`

// Plugin to generate version.json in dist folder
const versionPlugin = () => ({
  name: 'version-plugin',
  writeBundle() {
    const versionInfo = {
      version: buildVersion,
      buildTime: istDate.toISOString().replace('Z', '+05:30'),
      timezone: 'IST',
    }
    fs.writeFileSync(
      path.resolve(__dirname, 'dist/version.json'),
      JSON.stringify(versionInfo, null, 2)
    )
  }
})

export default defineConfig({
  plugins: [react(), versionPlugin()],
  define: {
    __BUILD_VERSION__: JSON.stringify(buildVersion),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
})
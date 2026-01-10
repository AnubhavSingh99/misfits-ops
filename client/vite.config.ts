import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// Generate build version: YYMMDD-HHMM format
const now = new Date()
const buildVersion = `${now.getFullYear().toString().slice(2)}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`

// Plugin to generate version.json in dist folder
const versionPlugin = () => ({
  name: 'version-plugin',
  writeBundle() {
    const versionInfo = {
      version: buildVersion,
      buildTime: now.toISOString(),
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
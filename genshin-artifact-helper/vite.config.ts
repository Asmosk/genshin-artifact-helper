import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import vueDevTools from 'vite-plugin-vue-devtools'
import { fixturesPlugin } from './vite-plugin-fixtures'
import { rollTablesPlugin } from './vite-plugin-roll-tables'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    vueDevTools(),
    fixturesPlugin(),
    rollTablesPlugin(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    watch: {
      ignored: ['**/src/__tests__/fixtures/**'],
    },
  },
})

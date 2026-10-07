import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: fileURLToPath(new URL('../public', import.meta.url)),
  plugins: [vue(), ui({ router: false })],
  server: { host: '127.0.0.1', port: 8770, strictPort: true },
  resolve: { dedupe: ['vue'] },
  build: { outDir: fileURLToPath(new URL('../build', import.meta.url)), emptyOutDir: true },
})

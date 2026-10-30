import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue(), ui({ colorMode: false, fonts: false, router: false, components: { dts: false }, autoImport: { dts: false }, ui: { colors: { primary: 'cyan', neutral: 'zinc' } } })],
  define: { "process.env.NODE_ENV": JSON.stringify("production"), __VUE_OPTIONS_API__: true, __VUE_PROD_DEVTOOLS__: false, __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false },
  build: {
    outDir: fileURLToPath(new URL('../static', import.meta.url)), emptyOutDir: false,
    lib: { entry: fileURLToPath(new URL('./main.js', import.meta.url)), formats: ['es'], fileName: () => 'asset-library.js', cssFileName: 'asset-library' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})

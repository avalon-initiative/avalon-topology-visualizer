/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// A read-only client: no bundled backend. It talks to whatever seed node
// the viewer enters, through @avalon-initiative/protocol-sdk.
export default defineConfig({
  plugins: [vue()],
  css: {
    preprocessorOptions: {
      scss: { api: 'modern-compiler' },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
})

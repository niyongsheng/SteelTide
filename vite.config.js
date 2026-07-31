import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: {
    host: true, // 局域网可访问，方便手机真机测试
  },
})

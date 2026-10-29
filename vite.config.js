import { defineConfig } from 'vite';

export default defineConfig({
  base: '/tsugu/',
  server: { host: true },
  test: {
    include: ['tests/**/*.test.js'],
  },
});

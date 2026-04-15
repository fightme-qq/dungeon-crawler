import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/dungeon-crawler/' : './',
  server: {
    port: 3000,
    host: '127.0.0.1'
  },
  build: {
    // Strip all console.* and debugger statements from production build
    // including Phaser's own logs — required for Yandex Games rule 1.14
    minify: 'esbuild',
    target: 'es2017',
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
});

import { defineConfig, Plugin } from 'vite';

// Removes crossorigin and type="module" from script tags in built HTML.
// Yandex Games CDN blocks ES modules — build as IIFE + plain <script> tag.
function fixScriptTags(): Plugin {
  return {
    name: 'fix-script-tags',
    apply: 'build',
    transformIndexHtml(html: string) {
      return html
        .replace(/ crossorigin="?anonymous"?/g, '')
        .replace(/ crossorigin/g, '')
        .replace(/ type="module"/g, '');
    },
  };
}

export default defineConfig({
  plugins: [fixScriptTags()],
  base: process.env.GITHUB_ACTIONS ? '/dungeon-crawler/' : './',
  server: {
    port: 3007,
    host: '127.0.0.1'
  },
  build: {
    minify: 'esbuild',
    target: 'es2017',
    modulePreload: false,
    rollupOptions: {
      output: {
        format: 'iife',
        name: 'DungeonCrawler',
      },
    },
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
});

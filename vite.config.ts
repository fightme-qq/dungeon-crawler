import { defineConfig, Plugin } from 'vite';

// Removes crossorigin attribute from script/link tags in built HTML.
// Yandex Games CDN doesn't send CORS headers — crossorigin causes module load failure.
function removeCrossorigin(): Plugin {
  return {
    name: 'remove-crossorigin',
    transformIndexHtml(html: string) {
      return html.replace(/ crossorigin="?anonymous"?/g, '').replace(/ crossorigin/g, '');
    },
  };
}

export default defineConfig({
  plugins: [removeCrossorigin()],
  base: process.env.GITHUB_ACTIONS ? '/dungeon-crawler/' : './',
  server: {
    port: 3000,
    host: '127.0.0.1'
  },
  build: {
    minify: 'esbuild',
    target: 'es2017',
    modulePreload: false,
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
});

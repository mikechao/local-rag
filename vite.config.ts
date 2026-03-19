import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import path from 'node:path';
import { createRequire } from 'node:module';
import { normalizePath } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const require = createRequire(import.meta.url);
const pdfjsDistPath = path.dirname(require.resolve('pdfjs-dist/package.json'));
const cMapsDir = normalizePath(path.join(pdfjsDistPath, 'cmaps'));
const pgliteDistPath = path.dirname(require.resolve('@electric-sql/pglite'));
const pgliteWasmPath = normalizePath(path.join(pgliteDistPath, 'pglite.wasm'));
const pgliteDataPath = normalizePath(path.join(pgliteDistPath, 'pglite.data'));

const config = defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: cMapsDir,
          dest: '',
        },
        {
          src: pgliteWasmPath,
          dest: '',
        },
        {
          src: pgliteDataPath,
          dest: '',
        },
      ],
    }),
    devtools(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  resolve: {
    alias: {
      "node:module": path.resolve(__dirname, "./src/lib/polyfills/node-module.ts"),
    },
  },
  assetsInclude: [/pglite\.wasm$/, /pglite\.data$/],
  optimizeDeps: {
    exclude: ['@electric-sql/pglite'],
    include: ['drizzle-orm/pglite'],
  },
  worker: {
    format: 'es',
  },
})

export default config

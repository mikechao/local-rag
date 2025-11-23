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

const config = defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: cMapsDir,
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

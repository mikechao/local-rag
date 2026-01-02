import { defineConfig } from 'vitest/config';
import path from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    alias: {
      // Mock out the problematic PDF loader entirely for these tests
      '@langchain/community/document_loaders/web/pdf': path.resolve(__dirname, './test/mocks/pdf-loader.ts'),
    },
  },
});
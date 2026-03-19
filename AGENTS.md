# Repository Guidelines

## Project Structure & Module Organization
This repo is a `pnpm` workspace managed with Turborepo. The main app lives in `apps/local-rag`, a Vite + TanStack React Start frontend for in-browser RAG. App code is organized under `src/` by concern: `routes/` for pages, `components/` for UI, `lib/` for retrieval and model logic, `hooks/`, `providers/`, and `workers/` for browser workers. Tests for the app live in `apps/local-rag/test`. The app now consumes published `@browser-ai/*` packages, while the vendored `packages/built-in-ai` tree remains in the repo as reference material with an example app in `packages/built-in-ai/examples/next-hybrid`.

## Build, Test, and Development Commands
Install once with `pnpm install`.

- `pnpm dev`: run workspace dev tasks through Turbo.
- `pnpm --filter local-rag dev`: start only the app on `http://localhost:3000`.
- `pnpm build`: build all workspaces.
- `pnpm test`: run all Vitest suites across the monorepo.
- `pnpm lint`: run workspace lint tasks.
- `pnpm format`: run workspace formatting.
- `pnpm --filter local-rag typecheck`: verify TypeScript types for the app.
- `pnpm --filter local-rag check`: run Biome format + lint checks for the app.

## Coding Style & Naming Conventions
Use TypeScript throughout. In `apps/local-rag`, Biome enforces 2-space indentation, double quotes, and import organization. In `packages/built-in-ai`, formatting is handled with Prettier. Use `PascalCase` for React components, `useX` for hooks, `camelCase` for utilities, and keep route filenames lowercase, matching the existing `src/routes/*.tsx` pattern. Do not hand-edit generated files such as `apps/local-rag/src/routeTree.gen.ts`.

## Testing Guidelines
Vitest is the test runner across the repo. App tests follow `apps/local-rag/test/**/*.test.ts`; package tests live beside each package in `test/`. Add unit tests for retrieval logic, chunking, worker adapters, and model integration boundaries when behavior changes. Run `pnpm test` before opening a PR, or scope runs with `pnpm --filter local-rag test`.

## Commit & Pull Request Guidelines
Recent history uses short, imperative commit subjects such as `Tweak system prompt` and `Increase rerank candidates to 30`. Follow that pattern: one clear action per commit, sentence case, no unnecessary prefixes. PRs should include a brief summary, linked issue when relevant, notes on risk or migration impact, and the commands you ran to validate changes. Include screenshots or short recordings for UI changes in `apps/local-rag`.

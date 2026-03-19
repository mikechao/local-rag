# Repository Guidelines

## Project Structure & Module Organization
This repository is a single Vite + TanStack React Start application for in-browser RAG. App code is organized under `src/` by concern: `routes/` for pages, `components/` for UI, `lib/` for retrieval and model logic, `hooks/`, `providers/`, and `workers/` for browser workers. Tests live in `test/`. The app consumes published `@browser-ai/*` packages.

## Build, Test, and Development Commands
Install once with `pnpm install`.

- `pnpm dev`: start the app on `http://localhost:3000`.
- `pnpm build`: build the production client and SSR bundles.
- `pnpm serve`: preview the production build locally.
- `pnpm test`: run Vitest suites.
- `pnpm lint`: run Biome linting.
- `pnpm format`: run Biome formatting.
- `pnpm typecheck`: verify TypeScript types.
- `pnpm check`: run Biome format + lint checks.
- `pnpm db:generate`: generate Drizzle migration output.

## Coding Style & Naming Conventions
Use TypeScript throughout. Biome enforces 2-space indentation, double quotes, and import organization. Use `PascalCase` for React components, `useX` for hooks, `camelCase` for utilities, and keep route filenames lowercase, matching the existing `src/routes/*.tsx` pattern. Do not hand-edit generated files such as `src/routeTree.gen.ts`.

## Testing Guidelines
Vitest is the test runner. Tests live under `test/**/*.test.ts` and `test/**/*.test.tsx`. The default environment is `node`; DOM tests opt into jsdom explicitly when needed. Add unit tests for retrieval logic, chunking, worker adapters, and model integration boundaries when behavior changes. Run `pnpm test` before opening a PR.

## Commit & Pull Request Guidelines
Recent history uses short, imperative commit subjects such as `Tweak system prompt` and `Increase rerank candidates to 30`. Follow that pattern: one clear action per commit, sentence case, no unnecessary prefixes. PRs should include a brief summary, linked issue when relevant, notes on risk or migration impact, and the commands you ran to validate changes. Include screenshots or short recordings for UI changes.

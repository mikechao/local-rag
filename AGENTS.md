# Repository Guidelines

## Project Structure & Module Organization
- React 19 app built with Vite + TanStack Start; path alias `@/*` maps to `src/*` (see `tsconfig.json`).
- Routes live in `src/routes` (file-based, `__root.tsx` layout, `index.tsx` entry). Avoid editing `src/routeTree.gen.ts`—it is generated.
- Reusable UI sits in `src/components` and `src/components/ui`; shared helpers in `src/lib/utils.ts`; global styles in `src/styles.css`.
- Static assets go in `public/`; build output lands in `dist/`. Cloudflare Worker config is in `wrangler.jsonc`.

## Build, Test, and Development Commands
- `pnpm install` – install dependencies.
- `pnpm dev` – start local dev server on port 3000.
- `pnpm build` – production bundle.
- `pnpm serve` – preview the production build locally.
- `pnpm test` – run Vitest suites (jsdom by default).
- `pnpm lint` / `pnpm format` / `pnpm check` – Biome lint, format, and combined checks.
- `pnpm deploy` – deploy to Cloudflare Workers via Wrangler (uses `wrangler.jsonc`).

## Coding Style & Naming Conventions
- Biome enforces tab indentation and double quotes; keep imports organized (auto-fix with `pnpm format`).
- Prefer functional React components with TypeScript, strict mode enabled. Keep route components lean and lift reusable UI into `src/components`.
- Use Tailwind utility classes; `cn` helper merges class lists. Name components in PascalCase, hooks in `useX` form, test files as `*.test.ts(x)`. Avoid touching generated files.

## Testing Guidelines
- Use Vitest + Testing Library for React behavior. Place tests beside components or under `src/__tests__`.
- Mock network calls when possible; use jsdom for DOM tests. Run `pnpm test -- --coverage` before PRs when adding logic-heavy code.

## MCP Servers
- 'chrome_dev_tools' can be used to launch an instance of chrome with the app for you to see the ui
- 'context7' can be used to look up documentation on various libraries and frameworks. Make sure you use the right version from package.json

## Commit & Pull Request Guidelines
- Existing history uses short sentence-case messages (e.g., "Added ModelDownload component"); follow that style, keeping scope clear.
- PRs should include: summary of changes, linked issue (if any), screenshots/GIFs for UI updates, and a checklist confirming `pnpm lint`, `pnpm test`, and `pnpm build` as relevant.
- For features touching deployment, note any Wrangler or env var changes explicitly.

## Security & Configuration Tips
- No secrets are required for local dev; avoid committing tokens or model artifacts. If adding env vars, load via `import.meta.env` and document in PR.
- The embedding model caches in the browser; when debugging downloads, clear cache/localStorage rather than altering source defaults.

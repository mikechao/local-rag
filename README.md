# local-rag monorepo

This repository contains a Turbo + pnpm monorepo with a web app and a vendored reference copy of browser AI provider packages.

## Repo structure

- `apps/local-rag`: Web app for local Retrieval-Augmented Generation (RAG). It’s a Vite + TanStack React Start app that runs a local RAG workflow in the browser and uses the published `@browser-ai/*` providers for model access.
- `packages/built-in-ai`: Vendored reference copy of the older `@built-in-ai/*` packages and examples. The app no longer consumes these packages through workspace links.

## Getting started

```bash
pnpm install
```

### Dev (all workspaces)

```bash
pnpm dev
```

### Dev (local-rag app only)

```bash
pnpm --filter local-rag dev
```

The app runs on `http://localhost:3000` by default.

## Common scripts

From the repo root:

- `pnpm dev` — run all dev tasks via Turbo
- `pnpm build` — build all workspaces
- `pnpm test` — run tests across the repo
- `pnpm lint` — lint all workspaces
- `pnpm format` — format via Turbo

## Notes

- `apps/local-rag` depends on published `@browser-ai/*` packages from the npm registry.
- `packages/built-in-ai` remains in the repo as a reference copy; see `packages/built-in-ai/README.md` for its own package docs.

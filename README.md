# local-rag monorepo

This repository contains a Turbo + pnpm monorepo with a web app and a set of shared AI provider packages.

## Repo structure

- `apps/local-rag`: Web app for local Retrieval-Augmented Generation (RAG). It’s a Vite + TanStack React Start app that runs a local RAG workflow in the browser and uses the `@built-in-ai/*` providers for model access.
- `packages/built-in-ai`: Library workspace that houses the `@built-in-ai/*` packages (core, web-llm, transformers-js) that provide in-browser model providers with fallback to server-side models via the Vercel AI SDK. It also contains examples and its own Turborepo config.

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

- `apps/local-rag` depends on the local `@built-in-ai/*` packages via workspace links.
- `packages/built-in-ai` is also usable on its own; see `packages/built-in-ai/README.md` for detailed package docs.

# SlopCop Web

A Foldkit application built with Effect.

## Getting Started

From the repository root, start the complete local stack:

```bash
pnpm dev
```

This runs the web Worker and its API service binding through Alchemy. The
`pnpm dev:web` command starts Vite only; API requests will be handled by
Vite's SPA fallback and return `index.html` instead of JSON.

## Learn More

- [Foldkit Documentation](https://foldkit.dev)
- [Effect Documentation](https://effect.website)

# SlopCop

SlopCop is an Effect-powered GitHub repository automation platform. It currently classifies pull requests and maintains labels from repository-specific rules.

## Structure

- `apps/web`: FoldKit browser application using the Elm architecture.
- `apps/bot`: Cloudflare Worker API, GitHub integration, queues, and D1 persistence.
- `packages/domain`: shared domain types and Effect schemas.
- `packages/api`: typed Effect HTTP API contracts.
- `alchemy.run.ts`: Cloudflare infrastructure and same-origin web/API routing.

## Boundaries

- Put domain types and schemas shared across applications in `packages/domain`.
- Put HTTP contracts and transport errors in `packages/api`.
- Keep UI-only Model state, Messages, Commands, and views in `apps/web`.
- Keep Worker implementations, persistence, secrets, and external API clients in `apps/bot`.
- Never expose OAuth secrets, GitHub tokens, installation tokens, or internal bearer tokens to the browser.

## Conventions

- Use Effect for schemas, services, errors, configuration, and side effects.
- Use idiomatic FoldKit unidirectional data flow; updates and views remain pure.
- Use Vite Plus (`vp`) for checking, testing, and builds.
- Prefer tagged unions that make invalid states unrepresentable.
- Make the smallest correct change and follow existing repository patterns.

## Verification

Run `vp check` and `vp test --run` for every affected workspace package.

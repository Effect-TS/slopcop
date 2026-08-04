# SlopCop

SlopCop is an Effect-powered GitHub repository automation platform. It currently classifies pull requests and maintains labels from repository-specific rules.

## Structure

- `apps/web`: FoldKit browser application using the Elm architecture.
- `apps/api`: Cloudflare Worker API.
- `apps/github-events`: GitHub event queue consumer and labeling orchestration.
- `apps/webhook-ingress`: GitHub webhook verification and queue producer.
- `packages/domain`: shared domain types and Effect schemas.
- `packages/api`: typed Effect HTTP API contracts.
- `packages/github`: shared GitHub App integration and persistence.
- `packages/infra`: shared Cloudflare resources, D1 adapter, and migrations.
- `packages/labeling`: shared labeling-rule management and persistence.
- `alchemy.run.ts`: Cloudflare infrastructure and same-origin web/API routing.

## Boundaries

- Put domain types and schemas shared across applications in `packages/domain`.
- Put HTTP contracts and transport errors in `packages/api`.
- Keep UI-only Model state, Messages, Commands, and views in `apps/web`.
- Keep Worker implementations and app-specific orchestration in their owning app.
- Keep deployment resources and platform adapters in `packages/infra`.
- Keep GitHub integration in `packages/github` and labeling-rule logic in `packages/labeling`.
- Never expose OAuth secrets, GitHub tokens, installation tokens, or internal bearer tokens to the browser.

## Conventions

- Use Effect for schemas, services, errors, configuration, and side effects.
- Use idiomatic FoldKit unidirectional data flow; updates and views remain pure.
- Use Vite Plus (`vp`) for checking, testing, and builds.
- Prefer tagged unions that make invalid states unrepresentable.
- Make the smallest correct change and follow existing repository patterns.

## Verification

Run `vp check` and `vp test --run` for every affected workspace package.

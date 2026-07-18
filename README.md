# Effect GitHub Triage Bot

A GitHub bot for triaging pull requests in the Effect repository. It is written with Effect and deployed to Cloudflare using Alchemy.

## Setup

```bash
vp install
vp check
```

Set the shared GitHub webhook secret in `.env`:

```dotenv
WEBHOOK_TOKEN=replace-with-a-random-secret
```

Deploy the Worker:

```bash
vp exec alchemy deploy
```

Alchemy uses the `dev_${USER}` stage by default.

## Webhook

Configure GitHub to send JSON webhooks to:

```text
https://your-worker.workers.dev/api/v1/webhooks/github
```

Use the same `WEBHOOK_TOKEN` as the GitHub webhook secret. A valid signed request returns `202 Accepted`.

Stream logs while testing:

```bash
vp exec alchemy tail --filter TriageBot
```

## Commands

```bash
vp run dev       # Start the development environment
vp check         # Format, lint, and type-check
vp run -r test   # Run workspace tests
vp run deploy    # Deploy
vp run destroy   # Destroy the deployed stack
```

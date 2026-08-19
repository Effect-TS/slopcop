# Local Development

This guide sets up SlopCop locally with Alchemy-managed Cloudflare dev infrastructure and a real development GitHub App installed only on sandbox repositories.

## Invariants

- D1, Queues, Workers, and SlopCop persisted state run locally through `alchemy dev`.
- GitHub is real, but credentials must belong to a development SlopCop GitHub App.
- The development GitHub App must be installed only on sandbox repositories.
- Do not use production GitHub App credentials, production D1, production queues, production hostnames, or production Cloudflare Access for local development.

## Cloudflare Login

Create or refresh a non-production Alchemy profile:

```sh
vp exec alchemy login --profile slopcop-dev --configure
```

Choose OAuth. If you customize scopes, keep Alchemy's defaults selected and add:

```text
dns_records:read
dns_records:edit
```

The dev profile needs to read the `effectful.co` zone, manage the per-user dev DNS record, create a dev Cloudflare Tunnel, and run the local Workers/D1/Queues dev graph.

## Environment File

Create `.env.dev` with development-only values:

```sh
GITHUB_APP_ID=
GITHUB_APP_SLUG=
GITHUB_ORGANIZATION_ID=
GITHUB_APP_PRIVATE_KEY_BASE64=
GITHUB_WEBHOOK_SECRET=
OPENAI_API_KEY=
```

Use the sandbox organization or user ID for `GITHUB_ORGANIZATION_ID`.

Encode the GitHub App private key with:

```sh
base64 -i /path/to/private-key.pem | tr -d '\n'
```

## GitHub App Settings

Create a separate development GitHub App. Configure:

```text
Webhook URL: https://hooks-dev-${USER}.slopcop.effectful.co/api/v1/webhooks/github
Webhook secret: same value as GITHUB_WEBHOOK_SECRET in .env.dev
```

Repository permissions:

```text
Checks: Read-only
Commit statuses: Read-only
Contents: Read-only
Issues: Read and write
Metadata: Read-only
Pull requests: Read-only
```

`Metadata: Read-only` covers the rules-for-branch endpoint used to discover
required checks. GitHub lists it as the only repository permission needed by a
GitHub App installation token for
[Get rules for a branch](https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch).

Subscribe to events:

```text
Check run
Check suite
Pull request
Pull request review
Status
```

Check run is the primary post-CI signal. Check suite and Status are fallback
re-evaluation paths for providers that do not deliver completed check runs; the
three CI subscriptions are not co-required. Enabling more than one broadens
compatibility but may produce redundant policy evaluations.

Install the app only on sandbox repositories.

## Run Locally

Start the Nix dev shell and Alchemy dev:

```sh
nix develop
vp exec alchemy dev --profile slopcop-dev --env-file .env.dev
```

Alchemy manages the dev webhook ingress:

- Adopts the existing Cloudflare zone `effectful.co`.
- Creates a dev-stage Cloudflare Tunnel.
- Creates `hooks-dev-${USER}.slopcop.effectful.co` as a proxied DNS record.
- Pins the local webhook Worker to port `8788`.
- Runs `cloudflared` through `Command.Dev`.
- Routes GitHub webhook traffic to `/api/v1/webhooks/github` on the local Worker.

## Verify

Check that the public tunnel reaches the local Worker:

```sh
curl -i https://hooks-dev-${USER}.slopcop.effectful.co/api/v1/webhooks/github
```

Expected response:

```text
405 Method Not Allowed
```

Then send or redeliver a `ping` from the development GitHub App. Expected response:

```text
202 Accepted
```

Finally, open or update a pull request in a sandbox repository. Confirm the webhook delivery succeeds, local Alchemy logs show processing, and any GitHub mutations happen only in the sandbox repository.

## Cleanup

To remove the dev Cloudflare tunnel and DNS record for your stage:

```sh
vp exec alchemy destroy --stage dev_$USER --profile slopcop-dev --env-file .env.dev
```

Review the plan before confirming. The `effectful.co` zone is adopted and retained; it should not be destroyed.

# SlopCop

A GitHub bot for triaging pull requests in the Effect repository. It is written with Effect and deployed to Cloudflare using Alchemy.

Protecting and serving the Effect repository, one suspicious pull request at a time. SlopCop has full authority to pull over AI-generated code.

<p align="center">
  <img src="assets/lt_dangle.png" alt="Lt. Dangle, reporting for SlopCop duty" width="500">
</p>

Lt. Dangle is on patrol. Please keep your pull requests where he can see them.

## GitHub App setup

SlopCop discovers repositories from the GitHub App installation for one organization. Configure:

- `GITHUB_APP_ID`: the numeric GitHub App ID.
- `GITHUB_APP_SLUG`: the public App slug used by the installation link.
- `GITHUB_ORGANIZATION_ID`: the immutable numeric ID of the Effect organization.
- `GITHUB_APP_PRIVATE_KEY_BASE64`: the App private key encoded as base64.
- `GITHUB_WEBHOOK_SECRET`: the secret configured on the GitHub App.

Configure the GitHub App setup URL to return to the SlopCop application, for example `https://slopcop.example.com/repositories?setup=complete`. Subscribe the App to pull request events; GitHub sends installation lifecycle events automatically. The callback query string is not trusted: SlopCop confirms installations through signed webhooks and GitHub App-authenticated reconciliation.

## Local development

Local development uses Alchemy-managed local Cloudflare resources plus a separate development GitHub App installed only on sandbox repositories.

```sh
nix develop
vp exec alchemy dev --stage dev_$USER --profile slopcop-dev --env-file .env.dev
```

See `docs/local-development.md` for the complete setup, GitHub App settings, and verification steps.

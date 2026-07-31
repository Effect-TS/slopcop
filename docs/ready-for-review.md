# Ready-for-review labeling

The `ready-for-review` labeling rule is deterministic. It applies its configured
GitHub label when a non-draft pull request:

- has at least one valid added `.changeset/*.md` file; and
- has passing results for every status check required by the rules applying to
  the pull request's base branch.

The rule reads the effective repository rules for the base branch instead of
treating optional or advisory jobs as required. A required check is passing
when its latest check run concludes `success`, `neutral`, or `skipped`, or when
its legacy commit status is `success`. Queued, in-progress, pending, missing,
cancelled, and failing checks are not passing. A required check owned by
SlopCop's configured `GITHUB_APP_ID` is excluded to prevent a self-deadlock.

Configure this through the labeling-rules HTTP API with:

```json
{
  "label": "ready for review",
  "kind": "ready-for-review",
  "instructions": "All required checks pass and a valid changeset is present.",
  "mode": "reconcile",
  "exclusiveGroup": null,
  "enabled": true
}
```

As with AI rules, the label must already exist in GitHub before the API will
enable the rule. As of 2026-07-31, `Effect-TS/effect` does not have a label named
`ready for review`; create it there before adding this configuration.

## GitHub App configuration

In the GitHub App settings, grant these repository permissions:

- Checks: read-only
- Commit statuses: read-only
- Contents: read-only
- Metadata: read-only
- Pull requests: read-only
- Issues: read and write

Subscribe the App to:

- Check run
- Check suite
- Pull request
- Status

After changing permissions or subscriptions, each installation must accept the
new permissions. SlopCop cannot make these GitHub App registration changes at
deploy time.

The rule removes its label when a PR is converted back to draft. Review
approvals and change requests are deliberately not inputs: the Effect
repository's active merge rules do not require approving reviews, and this
policy is limited to required CI plus Changesets validity.

Reconciliation uses the configured label as bot-owned state. GitHub's current
label API and the decision log cannot distinguish a maintainer removing and
later re-adding the same label between deliveries, so reconcile mode can remove
such a manually restored label when the deterministic conditions are false.

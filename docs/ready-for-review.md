# Ready-for-review labeling

The `ready-for-review` labeling rule is deterministic. It applies its configured
GitHub label when a non-draft pull request:

- has at least one valid added `.changeset/*.md` file; and
- has passing results for every status check required by the rules applying to
  the pull request's base branch; and
- has no reviewer's latest decisive review requesting changes.

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
  "instructions": "Required checks pass, a valid changeset is present, and no reviewer requests changes.",
  "mode": "reconcile",
  "exclusiveGroup": null,
  "enabled": true
}
```

As with AI rules, the label must already exist in GitHub before the API will
enable the rule. `Effect-TS/effect` has the exact `ready for review` label, so it
can be selected when adding this configuration.

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
- Pull request review
- Status

After changing permissions or subscriptions, each installation must accept the
new permissions. SlopCop cannot make these GitHub App registration changes at
deploy time.

The rule removes its label when a PR is converted back to draft or a reviewer's
latest decisive review requests changes. A later approval by that reviewer or
dismissal of the change-request review clears the review block.

Reconciliation uses the configured label as bot-owned state. GitHub's current
label API and the decision log cannot distinguish a maintainer removing and
later re-adding the same label between deliveries, so reconcile mode can remove
such a manually restored label when the deterministic conditions are false.

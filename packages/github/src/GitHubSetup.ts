import * as GitHubInstallation from "@slopcop/domain/GitHub/GitHubInstallation"
import * as Setup from "@slopcop/domain/GitHub/Setup"
import type * as GitHubInstallationWebhook from "@slopcop/domain/GitHub/WebhookEvent/GitHubInstallation"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { GitHubInstallationClient } from "./GitHubInstallationClient.ts"
import { GitHubInstallationsRepo } from "./repositories/GitHubInstallationsRepo.ts"
import { GitHubRepositoriesRepo } from "./repositories/GitHubRepositoriesRepo.ts"

const installationUrl = (slug: string) =>
  `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`

export class GitHubSetup extends Context.Service<
  GitHubSetup,
  {
    readonly getStatus: () => Effect.Effect<Setup.SetupStatus, unknown>
    readonly refresh: () => Effect.Effect<Setup.SetupStatus, unknown>
    readonly processInstallation: (
      event: GitHubInstallationWebhook.InstallationWebhookEvent,
    ) => Effect.Effect<void, unknown>
    readonly processInstallationRepositories: (
      event: GitHubInstallationWebhook.InstallationRepositoriesWebhookEvent,
    ) => Effect.Effect<void, unknown>
  }
>()("@slopcop/github/GitHubSetup", {
  make: Effect.gen(function* () {
    const organizationId = yield* Config.string("GITHUB_ORGANIZATION_ID").pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(GitHubInstallation.GitHubAccountId),
      ),
    )
    const appSlug = yield* Config.string("GITHUB_APP_SLUG")
    const installations = yield* GitHubInstallationsRepo
    const repositories = yield* GitHubRepositoriesRepo
    const client = yield* GitHubInstallationClient

    const isTarget = (
      installation: GitHubInstallation.GitHubInstallationSummary,
    ) =>
      installation.account.type === "Organization" &&
      installation.account.id === organizationId

    const upsert = (
      installation: GitHubInstallation.GitHubInstallationSummary,
      syncStatus: GitHubInstallation.GitHubInstallationSyncStatus,
      status: GitHubInstallation.GitHubInstallationStatus = installation.suspended_at ===
      null
        ? "active"
        : "suspended",
    ) =>
      installations.upsert({
        githubId: installation.id,
        accountId: installation.account.id,
        accountLogin: installation.account.login,
        accountType: installation.account.type,
        repositorySelection: installation.repository_selection,
        status,
        syncStatus,
        htmlUrl: installation.html_url,
      })

    const synchronize = Effect.fn("GitHubSetup.synchronize")(function* (
      installation: GitHubInstallation.GitHubInstallationSummary,
    ) {
      if (!isTarget(installation)) {
        return yield* Effect.annotateLogs(
          Effect.logInfo("Ignored GitHub App installation for another account"),
          {
            installationId: installation.id,
            accountId: installation.account.id,
          },
        )
      }

      yield* upsert(installation, "pending", "active")
      yield* Effect.gen(function* () {
        const discovered = yield* client.listRepositories(installation.id).pipe(
          Effect.map((items) =>
            items.map(({ id, slug, isPrivate }) => ({
              githubId: id,
              owner: slug.owner,
              repo: slug.repo,
              isPrivate,
            })),
          ),
        )
        yield* repositories.replaceInstallationRepositories(
          installation.id,
          discovered,
        )
      }).pipe(
        Effect.tapError(() =>
          installations.setSyncState(
            installation.id,
            "failed",
            "SlopCop could not synchronize repositories from GitHub. Retry synchronization; existing labeling rules were preserved.",
          ),
        ),
      )
      yield* installations.setSyncState(installation.id, "ready")
    })

    const getStatus = Effect.fn("GitHubSetup.getStatus")(function* () {
      const maybeInstallation = yield* installations.findActive()
      if (Option.isNone(maybeInstallation)) {
        return Setup.AppNotInstalled.make({
          installationUrl: installationUrl(appSlug),
        })
      }

      const installation = maybeInstallation.value
      if (installation.status === "suspended") {
        return Setup.SynchronizationFailed.make({
          message:
            "The SlopCop GitHub App installation is suspended. An Effect organization owner must unsuspend it before patrol can resume.",
        })
      }
      if (installation.syncStatus === "pending") {
        return Setup.Synchronizing.make({})
      }
      if (installation.syncStatus === "failed") {
        return Setup.SynchronizationFailed.make({
          message: Option.getOrElse(
            installation.lastError,
            () =>
              "SlopCop could not synchronize the GitHub App installation. Retry synchronization.",
          ),
        })
      }

      const configuredRepositories = yield* repositories.list()
      return configuredRepositories.length === 0
        ? Setup.NoRepositoriesSelected.make({
            configurationUrl: installation.htmlUrl,
          })
        : Setup.Ready.make({})
    })

    const refresh = Effect.fn("GitHubSetup.refresh")(function* () {
      const available = yield* client.listInstallations()
      const target = available.find(isTarget)
      if (target === undefined) {
        const current = yield* installations.findActive()
        if (Option.isSome(current)) {
          yield* installations.delete(current.value.githubId)
        }
      } else if (target.suspended_at === null) {
        yield* synchronize(target)
      } else {
        yield* upsert(target, "ready", "suspended")
      }
      return yield* getStatus()
    })

    const processInstallation = Effect.fn("GitHubSetup.processInstallation")(
      function* (event: GitHubInstallationWebhook.InstallationWebhookEvent) {
        const installation = event.payload.installation
        if (!isTarget(installation)) return

        switch (event.payload.action) {
          case "created":
          case "unsuspend":
          case "new_permissions_accepted":
            yield* synchronize(installation)
            return
          case "suspend":
            yield* upsert(installation, "ready", "suspended")
            return
          case "deleted":
            yield* installations.delete(installation.id)
            return
        }
      },
    )

    const processInstallationRepositories = Effect.fn(
      "GitHubSetup.processInstallationRepositories",
    )(function* (
      event: GitHubInstallationWebhook.InstallationRepositoriesWebhookEvent,
    ) {
      yield* synchronize(event.payload.installation)
    })

    return {
      getStatus,
      refresh,
      processInstallation,
      processInstallationRepositories,
    }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)

  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(GitHubInstallationClient.layer),
    Layer.provide(GitHubInstallationsRepo.layer),
    Layer.provide(GitHubRepositoriesRepo.layer),
  )
}

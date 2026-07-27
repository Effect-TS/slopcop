import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Effect from "effect/Effect"
import * as Config from "effect/Config"
import * as Option from "effect/Option"
import Worker from "./apps/bot/src/Worker.ts"
import GitHubEventsWorker from "./apps/bot/src/GitHubEventsWorker.ts"
import { WebhookWorker } from "./apps/bot/src/WebhookWorker.ts"
import { D1Database } from "./apps/bot/src/Sql.ts"
import {
  GitHubEventsQueue,
  GitHubEventsDeadLetterQueue,
} from "./apps/bot/src/GitHub/GitHubEventQueue.ts"

const State = Cloudflare.state()
const CLOUDFLARE_ACCESS_ISSUER = "https://effectful.cloudflareaccess.com"

export default Alchemy.Stack(
  "SlopCop",
  {
    providers: Cloudflare.providers(),
    state: State,
  },
  Effect.gen(function* () {
    const appHostname = yield* Config.option(
      Config.string("SLOPCOP_APP_HOSTNAME"),
    )
    const webhookHostname = yield* Config.option(
      Config.string("SLOPCOP_WEBHOOK_HOSTNAME"),
    )
    const accessIdpId = yield* Config.option(
      Config.string("CLOUDFLARE_ACCESS_IDP_ID"),
    )
    const accessGitHubOrganization = yield* Config.option(
      Config.string("CLOUDFLARE_ACCESS_GITHUB_ORGANIZATION"),
    )
    const accessGitHubTeam = yield* Config.option(
      Config.string("CLOUDFLARE_ACCESS_GITHUB_TEAM"),
    )
    const hasAnyProductionAccessConfig =
      Option.isSome(appHostname) ||
      Option.isSome(webhookHostname) ||
      Option.isSome(accessIdpId) ||
      Option.isSome(accessGitHubOrganization)
    const hasCompleteProductionAccessConfig =
      Option.isSome(appHostname) &&
      Option.isSome(webhookHostname) &&
      Option.isSome(accessIdpId) &&
      Option.isSome(accessGitHubOrganization)
    if (hasAnyProductionAccessConfig && !hasCompleteProductionAccessConfig) {
      return yield* Effect.die(
        new Error(
          "Cloudflare Access configuration is incomplete. Set SLOPCOP_APP_HOSTNAME, SLOPCOP_WEBHOOK_HOSTNAME, CLOUDFLARE_ACCESS_IDP_ID, and CLOUDFLARE_ACCESS_GITHUB_ORGANIZATION together.",
        ),
      )
    }
    const productionAccessConfig = Option.all({
      appHostname,
      webhookHostname,
      accessIdpId,
      accessGitHubOrganization,
    })
    const db = yield* D1Database

    const queue = yield* GitHubEventsQueue
    const deadLetterQueue = yield* GitHubEventsDeadLetterQueue

    const worker = yield* Worker
    yield* GitHubEventsWorker
    const webhook = yield* WebhookWorker(
      Option.match(webhookHostname, {
        onNone: () => ({ url: true }),
        onSome: (domain) => ({ url: false, domain }),
      }),
    )
    const accessApplication = yield* Option.match(productionAccessConfig, {
      onNone: () => Effect.succeed(Option.none()),
      onSome: (config) =>
        Effect.gen(function* () {
          const githubOrganization = Option.match(accessGitHubTeam, {
            onNone: () => ({
              identityProviderId: config.accessIdpId,
              name: config.accessGitHubOrganization,
            }),
            onSome: (team) => ({
              identityProviderId: config.accessIdpId,
              name: config.accessGitHubOrganization,
              team,
            }),
          })
          const policy = yield* Cloudflare.Access.Policy(
            "SlopCopDashboardAllow",
            {
              name: `SlopCop Dashboard - Allow ${config.accessGitHubOrganization} GitHub Organization`,
              decision: "allow",
              include: [{ githubOrganization }],
              sessionDuration: "24h",
            },
          )
          const application = yield* Cloudflare.Access.Application(
            "SlopCopDashboardAccess",
            {
              type: "self_hosted",
              name: "SlopCop Dashboard",
              domain: config.appHostname,
              allowedIdps: [config.accessIdpId],
              autoRedirectToIdentity: true,
              sessionDuration: "24h",
              policies: [policy.policyId],
            },
          )
          return Option.some(application)
        }),
    })
    const web = yield* Cloudflare.Website.Vite("SlopCopWeb", {
      name: "slopcop-web",
      rootDir: "apps/web",
      main: "worker.ts",
      ...Option.match(appHostname, {
        onNone: () => ({ url: true }),
        onSome: (domain) => ({ url: false, domain }),
      }),
      env: {
        API: worker,
        SLOPCOP_ACCESS_MODE: Option.isSome(accessApplication)
          ? "cloudflare-access"
          : "local-development",
        ...Option.match(accessApplication, {
          onNone: () => ({}),
          onSome: (application) => ({
            CLOUDFLARE_ACCESS_AUD: application.aud,
            CLOUDFLARE_ACCESS_ISSUER,
          }),
        }),
      },
      assets: {
        runWorkerFirst: ["/api/*"],
        notFoundHandling: "single-page-application",
      },
    })

    return {
      databaseName: db.databaseName,

      queueName: queue.queueName,
      deadLetterQueueName: deadLetterQueue.queueName,

      workerName: worker.workerName,
      webUrl: Option.match(appHostname, {
        onNone: () => web.url,
        onSome: (hostname) => `https://${hostname}`,
      }),
      webhookUrl: Option.match(webhookHostname, {
        onNone: () => webhook.url,
        onSome: (hostname) => `https://${hostname}`,
      }),
    }
  }),
)

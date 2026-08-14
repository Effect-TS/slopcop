import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Command from "alchemy/Command"
import * as Output from "alchemy/Output"
import { adopt } from "alchemy/AdoptPolicy"
import * as Effect from "effect/Effect"
import * as Config from "effect/Config"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { makeWorker } from "./apps/api/src/Worker.ts"
import { makeGitHubEventsWorker } from "./apps/github-events/src/Worker.ts"
import { makeGitHubDataSyncWorker } from "./apps/github-data-sync/src/Worker.ts"
import { WebhookWorker } from "./apps/webhook-ingress/src/Worker.ts"
import { makeD1Database } from "./packages/infra/src/Sql.ts"
import * as CloudflareResourceNames from "./packages/infra/src/CloudflareResourceNames.ts"
import { makeGitHubEventQueueResources } from "./packages/infra/src/GitHubEventQueueResources.ts"
import { makeGitHubDataSyncQueueResources } from "./packages/infra/src/GitHubDataSyncQueueResources.ts"

const State = Cloudflare.state()
const CLOUDFLARE_ACCESS_ISSUER = "https://effectful.cloudflareaccess.com"
const DEV_TUNNEL_ZONE_NAME = "effectful.co"
const DEV_TUNNEL_HOSTNAME_SUFFIX = "slopcop.effectful.co"
const DEV_WEBHOOK_PORT = 8788

const makeDevHostnameLabel = (value: string) => {
  const label = value.toLowerCase().replace(/[^a-z0-9-]+/g, "-")
  const trimmed = label.replace(/^-+|-+$/g, "")
  return trimmed === "" ? "local" : trimmed
}

export default Alchemy.Stack(
  "SlopCop",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Command.providers()),
    state: State,
  },
  Effect.gen(function* () {
    const { dev } = yield* Alchemy.AlchemyContext
    const stage = yield* Alchemy.Stage
    const resourceNames = CloudflareResourceNames.make({ dev, stage })
    const configuredAppHostname = yield* Config.option(
      Config.string("SLOPCOP_APP_HOSTNAME"),
    )
    const configuredWebhookHostname = yield* Config.option(
      Config.string("SLOPCOP_WEBHOOK_HOSTNAME"),
    )
    const configuredAccessIdpId = yield* Config.option(
      Config.string("CLOUDFLARE_ACCESS_IDP_ID"),
    )
    const configuredAccessGitHubOrganization = yield* Config.option(
      Config.string("CLOUDFLARE_ACCESS_GITHUB_ORGANIZATION"),
    )
    const appHostname = dev ? Option.none() : configuredAppHostname
    const webhookHostname = dev ? Option.none() : configuredWebhookHostname
    const accessIdpId = dev ? Option.none() : configuredAccessIdpId
    const accessGitHubOrganization = dev
      ? Option.none()
      : configuredAccessGitHubOrganization
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
    const database = makeD1Database(resourceNames)
    const db = yield* database

    const queueResources = makeGitHubEventQueueResources(resourceNames)
    const queue = yield* queueResources.queue
    const deadLetterQueue = yield* queueResources.deadLetterQueue
    const dataSyncQueueResources =
      makeGitHubDataSyncQueueResources(resourceNames)
    yield* dataSyncQueueResources.queue
    yield* dataSyncQueueResources.deadLetterQueue

    const devWebhookTunnelHostname = yield* dev
      ? Effect.gen(function* () {
          const user = yield* Config.string("USER").pipe(
            Config.withDefault("local"),
          )
          const hostname = `hooks-dev-${makeDevHostnameLabel(user)}.${DEV_TUNNEL_HOSTNAME_SUFFIX}`
          const zone = yield* Cloudflare.Zone.Zone("SlopCopDevTunnelZone", {
            name: DEV_TUNNEL_ZONE_NAME,
          }).pipe(adopt(true))
          const tunnel = yield* Cloudflare.Tunnel.Tunnel(
            "SlopCopDevWebhookTunnel",
            { name: resourceNames.name("slopcop-dev-webhook-tunnel") },
          )
          yield* Cloudflare.Tunnel.Configuration(
            "SlopCopDevWebhookTunnelConfiguration",
            {
              tunnelId: tunnel.tunnelId,
              ingress: [
                {
                  hostname,
                  service: `http://localhost:${DEV_WEBHOOK_PORT}`,
                },
              ],
            },
          )
          yield* Cloudflare.DNS.Record("SlopCopDevWebhookDns", {
            zoneId: zone.zoneId,
            name: hostname,
            type: "CNAME",
            content: Output.interpolate`${tunnel.tunnelId}.cfargotunnel.com`,
            proxied: true,
          })
          yield* Command.Dev("SlopCopDevCloudflared", {
            command: "cloudflared tunnel run --token $CLOUDFLARED_TUNNEL_TOKEN",
            shell: true,
            env: {
              CLOUDFLARED_TUNNEL_TOKEN: tunnel.token,
            },
          })
          return Option.some(hostname)
        })
      : Effect.succeed(Option.none<string>())

    const worker = yield* makeWorker({
      resourceNames,
      database,
      dataSyncQueue: dataSyncQueueResources.queue,
    })
    yield* makeGitHubEventsWorker({
      resourceNames,
      database,
      queue: queueResources.queue,
      deadLetterQueueName: queueResources.deadLetterQueueName,
    })
    yield* makeGitHubDataSyncWorker({
      resourceNames,
      database,
      queue: dataSyncQueueResources.queue,
      deadLetterQueueName: dataSyncQueueResources.deadLetterQueueName,
    })
    const webhook = yield* WebhookWorker(
      Option.match(webhookHostname, {
        onNone: () => ({
          resourceNames,
          queue: queueResources.queue,
          url: true,
          ...(dev
            ? {
                worker: { dev: { port: DEV_WEBHOOK_PORT, strictPort: true } },
              }
            : {}),
        }),
        onSome: (domain) => ({
          resourceNames,
          queue: queueResources.queue,
          url: false,
          domain,
        }),
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
              name: resourceNames.name(
                `SlopCop Dashboard - Allow ${config.accessGitHubOrganization} GitHub Organization`,
              ),
              decision: "allow",
              include: [{ githubOrganization }],
              sessionDuration: "24h",
            },
          )
          const application = yield* Cloudflare.Access.Application(
            "SlopCopDashboardAccess",
            {
              type: "self_hosted",
              name: resourceNames.name("SlopCop Dashboard"),
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
      name: resourceNames.name("slopcop-web"),
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
        onNone: () =>
          Option.match(devWebhookTunnelHostname, {
            onNone: () => webhook.url,
            onSome: (hostname) => `https://${hostname}`,
          }),
        onSome: (hostname) => `https://${hostname}`,
      }),
    }
  }),
)

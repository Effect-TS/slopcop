import * as Cloudflare from "alchemy/Cloudflare"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Etag from "effect/unstable/http/Etag"
import * as HttpPlatform from "effect/unstable/http/HttpPlatform"
import * as HttpRouter from "effect/unstable/http/HttpRouter"
import { ApiDocsLayer, ApiHandlersLayer } from "./Api.ts"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import type { WorkerProps } from "alchemy/Cloudflare"
import { LabelingRules } from "@slopcop/labeling/LabelingRules"
import { GitHubSetup } from "@slopcop/github/GitHubSetup"
import { D1Database, makeDatabaseLayer } from "@slopcop/infra/Sql"
import * as CloudflareResourceNames from "@slopcop/infra/CloudflareResourceNames"
import { Repositories } from "./GitHub/Repositories.ts"

export const makeWorker = (options: {
  readonly resourceNames: CloudflareResourceNames.ResourceNames
  readonly database: typeof D1Database
  readonly worker?: Partial<WorkerProps>
}) =>
  Cloudflare.Worker(
    "SlopCop",
    {
      name: options.resourceNames.name("slopcop-api"),
      main: import.meta.url,
      workersDev: false,
      compatibility: { flags: ["nodejs_compat"] },
      ...options.worker,
    },
    Effect.gen(function* () {
      const HttpPlatformStubLayer = Layer.succeed(HttpPlatform.HttpPlatform, {
        fileResponse: () =>
          Effect.die("HttpPlatform.fileResponse not supported"),
        fileWebResponse: () =>
          Effect.die("HttpPlatform.fileWebResponse not supported"),
      })

      const HttpLayer = Layer.mergeAll(ApiHandlersLayer, ApiDocsLayer).pipe(
        Layer.provide(FetchHttpClient.layer),
        Layer.provide(LabelingRules.layer),
        Layer.provide(Repositories.layer),
        Layer.provide(GitHubSetup.layer),
        Layer.provide([Etag.layer, HttpPlatformStubLayer, Path.layer]),
      )

      const MainLayer = HttpLayer.pipe(
        Layer.provide(makeDatabaseLayer(options.database)),
        Layer.orDie,
      )

      const handler = yield* HttpRouter.toHttpEffect(MainLayer)

      return { fetch: handler }
    }).pipe(Effect.provide([Cloudflare.D1.QueryDatabaseBinding])),
  )

export default makeWorker({
  resourceNames: CloudflareResourceNames.production,
  database: D1Database,
})

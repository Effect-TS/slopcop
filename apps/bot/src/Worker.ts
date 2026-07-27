import * as Cloudflare from "alchemy/Cloudflare"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Etag from "effect/unstable/http/Etag"
import * as HttpPlatform from "effect/unstable/http/HttpPlatform"
import * as HttpRouter from "effect/unstable/http/HttpRouter"
import { ApiDocsLayer, ApiHandlersLayer } from "./Api.ts"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import { LabelingRules } from "./Labeling/LabelingRules.ts"
import { DatabaseLayer } from "./Sql.ts"

export default Cloudflare.Worker(
  "SlopCop",
  {
    name: "slopcop-api",
    main: import.meta.url,
    url: false,
    compatibility: { flags: ["nodejs_compat"] },
  },
  Effect.gen(function* () {
    const HttpPlatformStubLayer = Layer.succeed(HttpPlatform.HttpPlatform, {
      fileResponse: () => Effect.die("HttpPlatform.fileResponse not supported"),
      fileWebResponse: () =>
        Effect.die("HttpPlatform.fileWebResponse not supported"),
    })

    const HttpLayer = Layer.mergeAll(ApiHandlersLayer, ApiDocsLayer).pipe(
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(LabelingRules.layer),
      Layer.provide([Etag.layer, HttpPlatformStubLayer, Path.layer]),
    )

    const MainLayer = HttpLayer.pipe(Layer.provide(DatabaseLayer), Layer.orDie)

    const handler = yield* HttpRouter.toHttpEffect(MainLayer)

    return { fetch: handler }
  }).pipe(Effect.provide([Cloudflare.D1.QueryDatabaseBinding])),
)

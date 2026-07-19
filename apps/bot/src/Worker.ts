import * as Cloudflare from "alchemy/Cloudflare"
import * as Drizzle from "alchemy/Drizzle"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Etag from "effect/unstable/http/Etag"
import * as HttpPlatform from "effect/unstable/http/HttpPlatform"
import * as HttpRouter from "effect/unstable/http/HttpRouter"
import { ApiDocsLayer, ApiHandlersLayer } from "./Api.ts"
import { Database, Hyperdrive } from "./Sql.ts"
import { GitHubEvents } from "./GitHub/GitHubEvents.ts"

export default Cloudflare.Worker(
  "TriageBot",
  {
    main: import.meta.url,
    compatibility: { flags: ["nodejs_compat"] },
  },
  Effect.gen(function* () {
    const hyperdrive = yield* Hyperdrive
    const connection = yield* Cloudflare.Hyperdrive.Connect(hyperdrive)
    const database = yield* Drizzle.postgres(connection.connectionString)
    const DatabaseLayer = Layer.succeed(Database, database)

    const HttpPlatformStubLayer = Layer.succeed(HttpPlatform.HttpPlatform, {
      fileResponse: () => Effect.die("HttpPlatform.fileResponse not supported"),
      fileWebResponse: () =>
        Effect.die("HttpPlatform.fileWebResponse not supported"),
    })

    const HttpLayer = Layer.mergeAll(ApiHandlersLayer, ApiDocsLayer).pipe(
      Layer.provide([Etag.layer, HttpPlatformStubLayer, Path.layer]),
      Layer.provide(HttpRouter.cors()),
    )

    const MainLayer = HttpLayer.pipe(
      Layer.provide([DatabaseLayer, GitHubEvents.layer]),
    )

    const handler = yield* HttpRouter.toHttpEffect(MainLayer)

    return { fetch: handler }
  }).pipe(
    Effect.provide([
      Cloudflare.Hyperdrive.ConnectBinding,
      Cloudflare.Queues.EventSourceLive,
      Cloudflare.Queues.WriteQueueBinding,
    ]),
  ),
)

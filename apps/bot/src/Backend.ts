import * as Cloudflare from "alchemy/Cloudflare"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path";
import * as Etag from "effect/unstable/http/Etag";
import * as HttpPlatform from "effect/unstable/http/HttpPlatform";
import * as HttpRouter from "effect/unstable/http/HttpRouter"
import { ApiDocsLayer, ApiHandlersLayer } from "./Api.ts"

const HttpPlatformStubLayer = Layer.succeed(HttpPlatform.HttpPlatform, {
  fileResponse: () => Effect.die("HttpPlatform.fileResponse not supported"),
  fileWebResponse: () =>
    Effect.die("HttpPlatform.fileWebResponse not supported"),
});

const HttpLayer = Layer.mergeAll(ApiHandlersLayer, ApiDocsLayer).pipe(
  Layer.provide([Etag.layer, HttpPlatformStubLayer, Path.layer]),
  Layer.provide(HttpRouter.cors()),
)

export default Cloudflare.Worker(
  "TriageBot",
  { main: import.meta.url },
  Effect.gen(function* () {
    return {
      fetch: yield* HttpRouter.toHttpEffect(HttpLayer),
    }
  }),
)

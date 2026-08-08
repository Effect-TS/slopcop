import * as Cloudflare from "alchemy/Cloudflare"
import * as Effect from "effect/Effect"
import * as Config from "effect/Config"
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
import { LabelingRuleTester } from "./Labeling/LabelingRuleTester.ts"
import { LabelingRuleTestCandidates } from "./Labeling/LabelingRuleTestCandidates.ts"
import { OpenAiLanguageModel } from "@effect/ai-openai"
import { OpenAiLayer } from "@slopcop/labeling/Ai"

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
      const labelingModel = yield* Config.string("LABELING_AI_MODEL").pipe(
        Config.withDefault("gpt-5.6-luna"),
      )

      const HttpLayer = Layer.mergeAll(ApiHandlersLayer, ApiDocsLayer).pipe(
        Layer.provide(FetchHttpClient.layer),
        Layer.provide(LabelingRules.layer),
        Layer.provide(LabelingRuleTester.layer),
        Layer.provide(LabelingRuleTestCandidates.layer),
        Layer.provide(
          OpenAiLanguageModel.model(labelingModel, {
            reasoning: { effort: "low" },
          }),
        ),
        Layer.provide(OpenAiLayer),
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

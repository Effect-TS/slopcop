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
import { GitHubDataSyncQueue as GitHubDataSyncQueueResource } from "@slopcop/infra/GitHubDataSyncQueueResources"
import * as CloudflareResourceNames from "@slopcop/infra/CloudflareResourceNames"
import { Repositories } from "./GitHub/Repositories.ts"
import { Policies } from "@slopcop/labeling/Policies"
import { GitHubClient } from "@slopcop/github/GitHubClient"
import { GitHubRepositoriesRepo } from "@slopcop/github/repositories/GitHubRepositoriesRepo"
import { LabelingPolicyTester } from "./Labeling/LabelingPolicyTester.ts"
import { PolicyFacts } from "@slopcop/labeling/PolicyFacts"
import { PoliciesRepo } from "@slopcop/labeling/repositories/PoliciesRepo"
import { OptionalPolicyAiLayer } from "@slopcop/labeling/Ai"
import { LabelingRuleTester } from "./Labeling/LabelingRuleTester.ts"
import { LabelingRuleTestCandidates } from "./Labeling/LabelingRuleTestCandidates.ts"
import { GitHubDataSyncQueue } from "./GitHub/GitHubDataSyncQueue.ts"
import { GitHubRepositoryLabelsRepo } from "@slopcop/github/repositories/GitHubRepositoryLabelsRepo"
import { GitHubPullRequestsRepo } from "@slopcop/github/repositories/GitHubPullRequestsRepo"

const PolicyTesterLayer = LabelingPolicyTester.layerNoDeps.pipe(
  Layer.provide(PolicyFacts.layer),
  Layer.provide(OptionalPolicyAiLayer),
  Layer.provide(Policies.layer),
  Layer.provide(PoliciesRepo.layer),
  Layer.provide(GitHubClient.layer),
  Layer.provide(GitHubRepositoriesRepo.layer),
)
const RuleTesterLayer = LabelingRuleTester.layerNoDeps.pipe(
  Layer.provide(PolicyTesterLayer),
  Layer.provide(PolicyFacts.layer),
  Layer.provide(OptionalPolicyAiLayer),
  Layer.provide(LabelingRules.layer),
  Layer.provide(GitHubClient.layer),
  Layer.provide(GitHubRepositoriesRepo.layer),
)

export const makeWorker = (options: {
  readonly resourceNames: CloudflareResourceNames.ResourceNames
  readonly database: typeof D1Database
  readonly dataSyncQueue: typeof GitHubDataSyncQueueResource
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
        Layer.provide(PolicyTesterLayer),
        Layer.provide(RuleTesterLayer),
        Layer.provide(LabelingRuleTestCandidates.layer),
        Layer.provide(LabelingRules.layer),
        Layer.provide(Policies.layer),
        Layer.provide(PoliciesRepo.layer),
        Layer.provide(GitHubClient.layer),
        Layer.provide(GitHubRepositoriesRepo.layer),
        Layer.provide(GitHubRepositoryLabelsRepo.layer),
        Layer.provide(GitHubPullRequestsRepo.layer),
        Layer.provide(Repositories.layer),
        Layer.provide(GitHubSetup.layer),
        Layer.provide(GitHubDataSyncQueue.layerWith(options.dataSyncQueue)),
        Layer.provide([Etag.layer, HttpPlatformStubLayer, Path.layer]),
      )

      const MainLayer = HttpLayer.pipe(
        Layer.provide(makeDatabaseLayer(options.database)),
        Layer.orDie,
      )

      const handler = yield* HttpRouter.toHttpEffect(MainLayer)

      return { fetch: handler }
    }).pipe(
      Effect.provide([
        Cloudflare.D1.QueryDatabaseBinding,
        Cloudflare.Queues.WriteQueueBinding,
      ]),
    ),
  )

export default makeWorker({
  resourceNames: CloudflareResourceNames.production,
  database: D1Database,
  dataSyncQueue: GitHubDataSyncQueueResource,
})

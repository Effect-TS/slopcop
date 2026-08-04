import * as GitHubWebhookEvent from "@slopcop/domain/GitHub/GitHubWebhookEvent"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { GitHubEventProcessors } from "../../src/GitHub/GitHubEventProcessors.ts"
import { PullRequestLabeling } from "../../src/Labeling/PullRequestLabeling.ts"
import { PullRequestLabelingProcessorLayerNoDeps } from "../../src/Labeling/PullRequestLabelingProcessor.ts"

const event = Schema.decodeUnknownSync(GitHubWebhookEvent.GitHubWebhookEvent)({
  id: "delivery-1",
  name: "pull_request",
  payload: {
    action: "opened",
    number: 42,
    pull_request: {
      id: 1,
      node_id: "PR_1",
      title: "Fix behavior",
      body: null,
      draft: false,
      user: { login: "octocat" },
      head: { sha: "abc123" },
      base: { ref: "main" },
    },
    repository: { id: 221458136, full_name: "Effect-TS/effect" },
    installation: { id: 456 },
  },
})

describe("PullRequestLabelingProcessor", () => {
  it.effect("dispatches pull request events to PullRequestLabeling", () => {
    let processed = 0
    const layer = PullRequestLabelingProcessorLayerNoDeps.pipe(
      Layer.provide(
        Layer.succeed(PullRequestLabeling, {
          process: () => Effect.sync(() => processed++),
        }),
      ),
      Layer.provideMerge(GitHubEventProcessors.layer),
    )

    return Effect.gen(function* () {
      const processors = yield* GitHubEventProcessors
      yield* processors.dispatch(event)
      expect(processed).toBe(1)
    }).pipe(Effect.scoped, Effect.provide(layer))
  })

  it.effect(
    "keeps processors registered after their setup scope closes",
    () => {
      let processed = 0
      const labeling = Layer.succeed(PullRequestLabeling, {
        process: () => Effect.sync(() => processed++),
      })

      return Effect.gen(function* () {
        const processors = yield* GitHubEventProcessors
        yield* Layer.build(
          PullRequestLabelingProcessorLayerNoDeps.pipe(Layer.provide(labeling)),
        ).pipe(Effect.scoped)

        yield* processors.dispatch(event)
        expect(processed).toBe(1)
      }).pipe(Effect.provide(GitHubEventProcessors.layer))
    },
  )
})

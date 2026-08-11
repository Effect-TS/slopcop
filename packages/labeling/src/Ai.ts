import { OpenAiLanguageModel } from "@effect/ai-openai"
import * as OpenAiClient from "@effect/ai-openai/OpenAiClient"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as Redacted from "effect/Redacted"
import * as Schedule from "effect/Schedule"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import { PolicyAi } from "./PolicyAi.ts"

export const OpenAiLayer = OpenAiClient.layerConfig({
  apiKey: Config.redacted("OPENAI_API_KEY"),
  transformClient: HttpClient.retryTransient({
    times: 3,
    schedule: Schedule.exponential(500),
  }),
}).pipe(Layer.provide(FetchHttpClient.layer))

export const openAiLayer = (apiKey: Redacted.Redacted<string>) =>
  OpenAiClient.layer({
    apiKey,
    transformClient: HttpClient.retryTransient({
      times: 3,
      schedule: Schedule.exponential(500),
    }),
  }).pipe(Layer.provide(FetchHttpClient.layer))

export const OptionalPolicyAiLayer = Layer.unwrap(
  Effect.gen(function* () {
    const apiKey = yield* Config.option(Config.redacted("OPENAI_API_KEY"))
    if (apiKey._tag === "None") return PolicyAi.unavailableLayer
    const model = yield* Config.string("LABELING_AI_MODEL").pipe(
      Config.withDefault("gpt-5.6-luna"),
    )
    return PolicyAi.layerNoDeps.pipe(
      Layer.provide(
        OpenAiLanguageModel.model(model, { reasoning: { effort: "low" } }),
      ),
      Layer.provide(openAiLayer(apiKey.value)),
    )
  }),
)

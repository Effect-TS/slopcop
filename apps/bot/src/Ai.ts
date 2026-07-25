import * as OpenAiClient from "@effect/ai-openai/OpenAiClient"
import * as Config from "effect/Config"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"

export const OpenAiLayer = OpenAiClient.layerConfig({
  apiKey: Config.redacted("OPENAI_API_KEY"),
  transformClient: HttpClient.retryTransient({
    times: 3,
    schedule: Schedule.exponential(500),
  }),
}).pipe(Layer.provide(FetchHttpClient.layer))

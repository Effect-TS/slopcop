import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Effect from "effect/Effect"
import Backend from "./apps/bot/src/Backend.ts"

export default Alchemy.Stack(
  "EffectTriage",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const backend = yield* Backend
    return {
      url: backend.url,
    }
  }),
)

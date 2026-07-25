import * as NodeCrypto from "node:crypto"
import {
  LabelingAdminIdentity,
  LabelingAdminMiddleware,
} from "@slopcop/api/LabelingRules/Security"
import { Unauthenticated } from "@slopcop/api/LabelingRules/Errors"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"

const digest = (value: string) =>
  NodeCrypto.createHash("sha256").update(value, "utf8").digest()

export const LabelingAdminMiddlewareLayer = Layer.effect(
  LabelingAdminMiddleware,
  Effect.gen(function* () {
    const configuredToken = yield* Config.redacted("LABELING_ADMIN_TOKEN")
    const expected = digest(Redacted.value(configuredToken))

    return {
      bearer: Effect.fnUntraced(function* (httpEffect, { credential }) {
        const actual = digest(Redacted.value(credential))
        if (!NodeCrypto.timingSafeEqual(expected, actual)) {
          return yield* new Unauthenticated({
            message:
              "A valid labeling administration bearer token is required.",
          })
        }
        return yield* httpEffect.pipe(
          Effect.provideService(LabelingAdminIdentity, {
            actor: "labeling-admin",
            role: "administrator",
          }),
        )
      }),
    }
  }),
)

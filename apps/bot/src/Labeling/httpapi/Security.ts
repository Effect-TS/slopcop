import {
  LabelingAdminIdentity,
  LabelingAdminMiddleware,
} from "@slopcop/api/LabelingRules/Security"
import { Unauthenticated } from "@slopcop/api/LabelingRules/Errors"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"

export const LabelingAdminMiddlewareLayerNoDeps = Layer.effect(
  LabelingAdminMiddleware,
  Effect.succeed({
    access: Effect.fnUntraced(function* (httpEffect, { credential }) {
      const subject = Redacted.value(credential)
      if (subject.length === 0) {
        return yield* new Unauthenticated({
          message: "A valid Cloudflare Access identity is required.",
        })
      }
      return yield* httpEffect.pipe(
        Effect.provideService(LabelingAdminIdentity, {
          actor: `cloudflare-access:${subject}`,
          role: "administrator",
        }),
      )
    }),
  }),
)

export const LabelingAdminMiddlewareLayer = LabelingAdminMiddlewareLayerNoDeps

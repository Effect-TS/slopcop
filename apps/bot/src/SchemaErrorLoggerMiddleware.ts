import { SchemaErrorLogger } from "@triage-bot/api/RootApi"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as HttpApiMiddleware from "effect/unstable/httpapi/HttpApiMiddleware"

export const SchemaErrorLoggerLayer =
  HttpApiMiddleware.layerSchemaErrorTransform(SchemaErrorLogger, (error) =>
    Effect.logWarning(Cause.fail(error)).pipe(
      Effect.flatMap(() => Effect.fail(error)),
    ),
  )

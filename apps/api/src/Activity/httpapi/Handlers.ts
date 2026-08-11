import { RootApi } from "@slopcop/api/RootApi"
import { LabelingRules } from "@slopcop/labeling/LabelingRules"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder"
import {
  formatAuditCursor,
  parseAuditCursor,
  toPublicAuditEntry,
} from "../../Labeling/httpapi/Handlers.ts"
import { LabelingAdminMiddlewareLayer } from "../../Labeling/httpapi/Security.ts"
export const ActivityApiHandlersLayer = HttpApiBuilder.group(
  RootApi,
  "activity",
  Effect.fnUntraced(function* (handlers) {
    const rules = yield* LabelingRules
    return handlers.handle("listLabelingRuleActivity", ({ query }) =>
      Effect.gen(function* () {
        const result = yield* rules
          .listActivity({
            repository: query.repository ?? null,
            operation: query.operation ?? null,
            cursor: yield* parseAuditCursor(query.cursor),
            limit: query.limit ?? 50,
          })
          .pipe(
            Effect.catch((error) =>
              Effect.logError("Rule activity request failed", error).pipe(
                Effect.andThen(Effect.die(error)),
              ),
            ),
          )
        return {
          entries: yield* Effect.forEach(result.entries, (entry) =>
            toPublicAuditEntry(entry).pipe(
              Effect.map((value) => ({
                repository: { owner: entry.owner, repo: entry.repo },
                ...value,
              })),
            ),
          ),
          nextCursor: yield* formatAuditCursor(result.nextCursor),
        }
      }),
    )
  }),
).pipe(Layer.provide(LabelingAdminMiddlewareLayer))

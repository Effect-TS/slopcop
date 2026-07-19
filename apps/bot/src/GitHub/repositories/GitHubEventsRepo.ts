import * as Cloudflare from "alchemy/Cloudflare"
import * as Drizzle from "alchemy/Drizzle"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type { GitHubWebHookEvent } from "@triage-bot/domain/GitHubWebhookEvent"
import { Hyperdrive } from "../../Sql.ts"
import { GitHubEvents, relations } from "../../Sql/schema.ts"
import { and, eq, lte, or, sql } from "drizzle-orm"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"

export type GitHubEventClaim = Data.TaggedEnum<{
  readonly Acquired: {}
  readonly Completed: {}
  readonly Busy: {}
}>
export const GitHubEventClaim = Data.taggedEnum<GitHubEventClaim>()

export class GitHubEventsRepoError extends Data.TaggedError(
  "GitHubEventsRepoError",
)<{
  readonly deliveryId: string
  readonly operation: "Claim" | "Complete" | "Release"
  readonly step:
    | "InsertDelivery"
    | "AcquireDelivery"
    | "ReadDeliveryStatus"
    | "MarkCompleted"
    | "ReturnToPending"
  readonly cause: EffectDrizzleQueryError
}> {}

const mapDatabaseError = (
  deliveryId: string,
  operation: GitHubEventsRepoError["operation"],
  step: GitHubEventsRepoError["step"],
) =>
  Effect.mapError(
    (cause: EffectDrizzleQueryError) =>
      new GitHubEventsRepoError({
        deliveryId,
        operation,
        step,
        cause,
      }),
  )

export class GitHubEventsRepo extends Context.Service<
  GitHubEventsRepo,
  {
    readonly claim: (
      event: GitHubWebHookEvent,
    ) => Effect.Effect<GitHubEventClaim, GitHubEventsRepoError>
    readonly complete: (
      deliveryId: string,
    ) => Effect.Effect<void, GitHubEventsRepoError>
    readonly release: (
      deliveryId: string,
      error: string,
    ) => Effect.Effect<void, GitHubEventsRepoError>
  }
>()("@triage-bot/bot/GitHub/repositories/GitHubEventsRepo", {
  make: Effect.gen(function* () {
    const conn = yield* Cloudflare.Hyperdrive.Connect(Hyperdrive)
    const db = yield* Drizzle.postgres(conn.connectionString, { relations })

    const claim = Effect.fn("GitHubEventsRepo.claim")(function* (
      event: GitHubWebHookEvent,
    ) {
      yield* db
        .insert(GitHubEvents)
        .values({
          id: event.deliveryId,
          name: event.eventName,
          status: "pending",
        })
        .onConflictDoNothing()
        .pipe(mapDatabaseError(event.deliveryId, "Claim", "InsertDelivery"))

      const claimed = yield* db
        .update(GitHubEvents)
        .set({
          status: "processing",
          attempts: sql`${GitHubEvents.attempts} + 1`,
          lastError: null,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(
          and(
            eq(GitHubEvents.id, event.deliveryId),
            or(
              eq(GitHubEvents.status, "pending"),
              and(
                eq(GitHubEvents.status, "processing"),
                lte(
                  GitHubEvents.updatedAt,
                  sql`CURRENT_TIMESTAMP - INTERVAL '5 minutes'`,
                ),
              ),
            ),
          ),
        )
        .returning({ id: GitHubEvents.id })
        .pipe(mapDatabaseError(event.deliveryId, "Claim", "AcquireDelivery"))

      if (claimed.length === 1) {
        return GitHubEventClaim.Acquired()
      }

      const [existing] = yield* db
        .select({ status: GitHubEvents.status })
        .from(GitHubEvents)
        .where(eq(GitHubEvents.id, event.deliveryId))
        .limit(1)
        .pipe(mapDatabaseError(event.deliveryId, "Claim", "ReadDeliveryStatus"))

      return existing?.status === "completed"
        ? GitHubEventClaim.Completed()
        : GitHubEventClaim.Busy()
    })

    const complete = Effect.fn("GitHubEventsRepo.complete")(function* (
      deliveryId: string,
    ) {
      yield* db
        .update(GitHubEvents)
        .set({
          status: "completed",
          lastError: null,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(
          and(
            eq(GitHubEvents.id, deliveryId),
            eq(GitHubEvents.status, "processing"),
          ),
        )
        .pipe(mapDatabaseError(deliveryId, "Complete", "MarkCompleted"))
    })

    const release = Effect.fn("GitHubEventsRepo.release")(function* (
      deliveryId: string,
      error: string,
    ) {
      yield* db
        .update(GitHubEvents)
        .set({
          status: "pending",
          lastError: error,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(
          and(
            eq(GitHubEvents.id, deliveryId),
            eq(GitHubEvents.status, "processing"),
          ),
        )
        .pipe(mapDatabaseError(deliveryId, "Release", "ReturnToPending"))
    })

    return { claim, complete, release } as const
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}

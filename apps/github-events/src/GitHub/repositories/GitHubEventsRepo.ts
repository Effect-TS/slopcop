import * as GitHubEvent from "@slopcop/domain/GitHub/GitHubEvent"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import type * as SqlError from "effect/unstable/sql/SqlError"
import * as SqlSchema from "effect/unstable/sql/SqlSchema"

export class GitHubEventsRepoError extends Data.TaggedError(
  "GitHubEventsRepoError",
)<{
  readonly eventId: GitHubEvent.GitHubEventId
  readonly cause:
    | GitHubEventNotFoundError
    | GitHubEventTransitionError
    | SqlError.SqlError
    | Schema.SchemaError
}> {}

export class GitHubEventNotFoundError extends Data.TaggedError(
  "GitHubEventNotFoundError",
)<{
  readonly eventId: GitHubEvent.GitHubEventId
}> {}

export class GitHubEventTransitionError extends Data.TaggedError(
  "GitHubEventTransitionError",
)<{
  readonly eventId: GitHubEvent.GitHubEventId
  readonly transition: "MarkCompleted" | "ReleaseClaim"
  readonly expectedStatus: "processing"
}> {}

export type GitHubEventClaim = Data.TaggedEnum<{
  readonly Claimed: { readonly event: GitHubEvent.GitHubEvent }
  readonly Busy: {}
  readonly Completed: {}
}>
export const GitHubEventClaim = Data.taggedEnum<GitHubEventClaim>()

export class GitHubEventsRepo extends Context.Service<
  GitHubEventsRepo,
  {
    readonly claim: (
      input: typeof GitHubEvent.GitHubEvent.insert.Type,
    ) => Effect.Effect<GitHubEventClaim, GitHubEventsRepoError>
    readonly markCompleted: (
      id: GitHubEvent.GitHubEventId,
    ) => Effect.Effect<GitHubEvent.GitHubEvent, GitHubEventsRepoError>
    readonly releaseClaim: (
      id: GitHubEvent.GitHubEventId,
      error: string,
    ) => Effect.Effect<GitHubEvent.GitHubEvent, GitHubEventsRepoError>
  }
>()("@slopcop/github-events/GitHub/repositories/GitHubEventsRepo", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const findById = SqlSchema.findOne({
      Request: GitHubEvent.GitHubEventId,
      Result: GitHubEvent.GitHubEvent,
      execute: (id) => sql`
        SELECT *
        FROM "github_events"
        WHERE "id" = ${id}
          AND "deleted_at" IS NULL
      `,
    })

    const insert = SqlSchema.void({
      Request: GitHubEvent.GitHubEvent.insert,
      execute: (request) => sql`
        INSERT INTO "github_events" ${sql.insert(request)}
        ON CONFLICT ("id") DO NOTHING
      `,
    })

    const releaseClaim = SqlSchema.findOneOption({
      Request: Schema.Struct({
        id: GitHubEvent.GitHubEventId,
        error: Schema.String,
      }),
      Result: GitHubEvent.GitHubEvent,
      execute: ({ id, error }) => sql`
         UPDATE "github_events"
         SET
           "status" = 'pending',
           "last_error" = ${error},
           "updated_at" = unixepoch() * 1000
         WHERE "id" = ${id}
           AND "status" = 'processing'
         RETURNING *
      `,
    })

    const setProcessing = SqlSchema.findOneOption({
      Request: GitHubEvent.GitHubEventId,
      Result: GitHubEvent.GitHubEvent,
      execute: (id) => sql`
        UPDATE "github_events"
        SET
           "status" = 'processing',
           "attempts" = "attempts" + 1,
           "last_error" = NULL,
           "updated_at" = unixepoch() * 1000
        WHERE "id" = ${id}
          AND "status" = 'pending'
        RETURNING *
      `,
    })

    const markCompleted = SqlSchema.findOneOption({
      Request: GitHubEvent.GitHubEventId,
      Result: GitHubEvent.GitHubEvent,
      execute: (id) => sql`
        UPDATE "github_events"
        SET
          "status" = 'completed',
          "last_error" = NULL,
          "updated_at" = unixepoch() * 1000
        WHERE "id" = ${id}
          AND "status" = 'processing'
        RETURNING *
      `,
    })

    return {
      claim: (input) =>
        insert(input).pipe(
          Effect.andThen(setProcessing(input.id)),
          Effect.flatMap(
            Effect.fnUntraced(function* (claimed) {
              if (Option.isSome(claimed)) {
                return GitHubEventClaim.Claimed({ event: claimed.value })
              }
              const event = yield* findById(input.id)
              return event.status === "completed"
                ? GitHubEventClaim.Completed()
                : GitHubEventClaim.Busy()
            }),
          ),
          Effect.catchTag(
            "NoSuchElementError",
            () =>
              new GitHubEventsRepoError({
                eventId: input.id,
                cause: new GitHubEventNotFoundError({ eventId: input.id }),
              }),
          ),
          Effect.mapError(toGitHubEventsRepoError(input.id)),
        ),
      markCompleted: (id) =>
        markCompleted(id).pipe(
          Effect.flatMap(requireTransition(id, "MarkCompleted")),
          Effect.mapError(toGitHubEventsRepoError(id)),
          Effect.withSpan("GitHubEventsRepo.markCompleted", {
            attributes: { eventId: id },
          }),
        ),
      releaseClaim: (id, error) =>
        releaseClaim({ id, error }).pipe(
          Effect.flatMap(requireTransition(id, "ReleaseClaim")),
          Effect.mapError(toGitHubEventsRepoError(id)),
          Effect.withSpan("GitHubEventsRepo.releaseClaim", {
            attributes: { eventId: id, error },
          }),
        ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}

const toGitHubEventsRepoError =
  (eventId: GitHubEvent.GitHubEventId) =>
  (cause: GitHubEventsRepoError | Schema.SchemaError | SqlError.SqlError) =>
    cause._tag === "GitHubEventsRepoError"
      ? cause
      : new GitHubEventsRepoError({ eventId, cause })

const requireTransition =
  (
    eventId: GitHubEvent.GitHubEventId,
    transition: GitHubEventTransitionError["transition"],
  ) =>
  (event: Option.Option<GitHubEvent.GitHubEvent>) =>
    Option.match(event, {
      onNone: () =>
        Effect.fail(
          new GitHubEventsRepoError({
            eventId,
            cause: new GitHubEventTransitionError({
              eventId,
              transition,
              expectedStatus: "processing",
            }),
          }),
        ),
      onSome: Effect.succeed,
    })

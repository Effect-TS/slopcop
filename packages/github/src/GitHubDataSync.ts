import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import { GitHubClient } from "./GitHubClient.ts"
import { GitHubPullRequestsRepo } from "./repositories/GitHubPullRequestsRepo.ts"
import { GitHubRepositoriesRepo } from "./repositories/GitHubRepositoriesRepo.ts"
import { GitHubRepositoryLabelsRepo } from "./repositories/GitHubRepositoryLabelsRepo.ts"

const labelsInterval = "15 minutes"
const pullRequestsInterval = "10 minutes"

const isDue = (now: DateTime.Utc, nextRefreshAt: DateTime.Utc | undefined) =>
  nextRefreshAt === undefined ||
  DateTime.toEpochMillis(nextRefreshAt) <= DateTime.toEpochMillis(now)

const failureDelay = (consecutiveFailures: number) => {
  switch (Math.min(consecutiveFailures, 4)) {
    case 0:
      return "1 minute"
    case 1:
      return "2 minutes"
    case 2:
      return "5 minutes"
    case 3:
      return "15 minutes"
    default:
      return "30 minutes"
  }
}

export class GitHubDataSync extends Context.Service<GitHubDataSync>()(
  "@slopcop/github/GitHubDataSync",
  {
    make: Effect.gen(function* () {
      const github = yield* GitHubClient
      const repositories = yield* GitHubRepositoriesRepo
      const labels = yield* GitHubRepositoryLabelsRepo
      const pullRequests = yield* GitHubPullRequestsRepo

      const syncLabels = Effect.fn("GitHubDataSync.syncLabels")(function* (
        repository: GitHubRepository.GitHubRepository,
        force = false,
      ) {
        const now = yield* DateTime.now
        const previous = yield* labels.findSync(repository.id)
        if (
          !force &&
          Option.isSome(previous) &&
          !isDue(now, previous.value.nextRefreshAt)
        ) {
          return
        }
        yield* labels.markRefreshing(repository.id, now)
        const nextRefreshAt = DateTime.addDuration(now, labelsInterval)
        yield* github.listRepositoryLabels(repository).pipe(
          Stream.runCollect,
          Effect.flatMap((snapshot) =>
            labels.publish(
              repository.id,
              snapshot,
              null,
              null,
              now,
              nextRefreshAt,
            ),
          ),
          Effect.tapError((error) => {
            const failures = Option.match(previous, {
              onNone: () => 0,
              onSome: (sync) => sync.consecutiveFailures,
            })
            return labels.markFailed(
              repository.id,
              now,
              DateTime.addDuration(now, failureDelay(failures)),
              String(error),
            )
          }),
        )
      })

      const syncPullRequests = Effect.fn("GitHubDataSync.syncPullRequests")(
        function* (
          repository: GitHubRepository.GitHubRepository,
          force = false,
        ) {
          const now = yield* DateTime.now
          const previous = yield* pullRequests.findSync(repository.id)
          if (
            !force &&
            Option.isSome(previous) &&
            !isDue(now, previous.value.nextRefreshAt)
          ) {
            return
          }
          yield* pullRequests.markRefreshing(repository.id, now)
          const nextRefreshAt = DateTime.addDuration(now, pullRequestsInterval)
          yield* github
            .listOpenPullRequestSnapshot(
              repository,
              Option.match(previous, {
                onNone: () => null,
                onSome: (sync) => sync.etag,
              }),
            )
            .pipe(
              Effect.flatMap((result) =>
                result._tag === "NotModified"
                  ? pullRequests.markNotModified(
                      repository.id,
                      now,
                      nextRefreshAt,
                    )
                  : pullRequests.publishOpen(
                      repository.id,
                      result.value.map((pullRequest) => ({
                        number: pullRequest.number,
                        state: pullRequest.state,
                        title: pullRequest.title,
                        body: pullRequest.body,
                        draft: pullRequest.draft,
                        author: pullRequest.author,
                        baseRef: pullRequest.baseRef,
                        headSha: pullRequest.headSha,
                        githubCreatedAt: pullRequest.createdAt,
                        githubUpdatedAt: pullRequest.updatedAt,
                      })),
                      result.etag,
                      result.lastModified,
                      now,
                      nextRefreshAt,
                    ),
              ),
              Effect.tapError((error) => {
                const failures = Option.match(previous, {
                  onNone: () => 0,
                  onSome: (sync) => sync.consecutiveFailures,
                })
                return pullRequests.markFailed(
                  repository.id,
                  now,
                  DateTime.addDuration(now, failureDelay(failures)),
                  String(error),
                )
              }),
            )
        },
      )

      const syncRepository = Effect.fn("GitHubDataSync.syncRepository")(
        function* (
          repository: GitHubRepository.GitHubRepository,
          force = false,
        ) {
          yield* syncLabels(repository, force)
          yield* syncPullRequests(repository, force)
        },
      )

      return {
        syncLabels,
        syncPullRequests,
        syncRepository,
        syncAll: (force = false) =>
          repositories.list().pipe(
            Effect.flatMap((items) =>
              Effect.forEach(
                items,
                (repository) => syncRepository(repository, force),
                { concurrency: 1 },
              ),
            ),
            Effect.asVoid,
          ),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide([
      GitHubClient.layer,
      GitHubRepositoriesRepo.layer,
      GitHubRepositoryLabelsRepo.layer,
      GitHubPullRequestsRepo.layer,
    ]),
  )
}

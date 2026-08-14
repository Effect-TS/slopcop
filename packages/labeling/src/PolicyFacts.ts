import type * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import type * as Program from "@slopcop/domain/Policy/PolicyProgram"
import {
  GitHubClient,
  type PullRequestSummary,
} from "@slopcop/github/GitHubClient"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import type { ChangedFileContentSelector } from "./PolicyCompiler.ts"
import {
  matchesPolicyPredicate,
  type PullRequestFacts,
} from "./PolicyEngine.ts"

export interface PolicyFactRequirements {
  readonly facts: ReadonlySet<Program.PullRequestFact>
  readonly changedFileContentSelectors: ReadonlyArray<ChangedFileContentSelector>
}

type PartialMatch = "Match" | "NoMatch" | "Unknown"
type ChangedFileWithoutContent = {
  readonly path: string
  readonly status: string
}

const partialChangedFileMatch = (
  item: Program.ChangedFileItemPredicate,
  file: ChangedFileWithoutContent,
): PartialMatch => {
  switch (item._tag) {
    case "All": {
      const results = item.predicates.map((child) =>
        partialChangedFileMatch(child, file),
      )
      return results.includes("NoMatch")
        ? "NoMatch"
        : results.every((result) => result === "Match")
          ? "Match"
          : "Unknown"
    }
    case "Any": {
      const results = item.predicates.map((child) =>
        partialChangedFileMatch(child, file),
      )
      return results.includes("Match")
        ? "Match"
        : results.every((result) => result === "NoMatch")
          ? "NoMatch"
          : "Unknown"
    }
    case "Not": {
      const result = partialChangedFileMatch(item.predicate, file)
      return result === "Match"
        ? "NoMatch"
        : result === "NoMatch"
          ? "Match"
          : "Unknown"
    }
    case "Predicate": {
      if (item.field === "content" && file.status !== "removed")
        return "Unknown"
      const actual =
        item.field === "path"
          ? file.path
          : item.field === "status"
            ? file.status
            : null
      return matchesPolicyPredicate(
        actual,
        item.operator,
        "value" in item ? item.value : undefined,
      )
        ? "Match"
        : "NoMatch"
    }
  }
}

const contentCandidatePaths = (
  selectors: ReadonlyArray<ChangedFileContentSelector>,
  files: ReadonlyArray<ChangedFileWithoutContent>,
  complete: boolean,
) => {
  const paths = new Set<string>()
  for (const selector of selectors) {
    const results = files.map((file) => ({
      file,
      result: partialChangedFileMatch(selector.item, file),
    }))
    const decided =
      selector.quantifier === "Any"
        ? results.some(({ result }) => result === "Match")
        : !complete ||
          (selector.quantifier === "All"
            ? results.some(({ result }) => result === "NoMatch")
            : results.some(({ result }) => result === "Match"))
    if (decided) continue
    results.forEach(({ file, result }) => {
      if (result === "Unknown" && file.status !== "removed")
        paths.add(file.path)
    })
  }
  return paths
}

export class PolicyFacts extends Context.Service<
  PolicyFacts,
  {
    readonly load: (
      repository: GitHubRepository.GitHubRepository,
      summary: PullRequestSummary,
      requirements: PolicyFactRequirements,
      currentLabels: ReadonlySet<string>,
    ) => Effect.Effect<
      PullRequestFacts,
      import("@slopcop/github/GitHubClient").GitHubClientError
    >
  }
>()("@slopcop/labeling/PolicyFacts", {
  make: Effect.gen(function* () {
    const github = yield* GitHubClient
    const ownAppId = yield* Config.option(
      Config.schema(Schema.Int, "GITHUB_APP_ID"),
    )
    const load = Effect.fn("PolicyFacts.load")(function* (
      repository: GitHubRepository.GitHubRepository,
      summary: PullRequestSummary,
      requirements: PolicyFactRequirements,
      currentLabels: ReadonlySet<string>,
    ) {
      const changedFileResult = requirements.facts.has(
        "pull_request.changed_files",
      )
        ? yield* github.listPullRequestFiles(repository, summary.number).pipe(
            Stream.take(101),
            Stream.runCollect,
            Effect.flatMap((files) => {
              const bounded = files.slice(0, 100)
              const contentPaths = contentCandidatePaths(
                requirements.changedFileContentSelectors,
                bounded.map((file) => ({
                  path: file.filename,
                  status: file.status,
                })),
                files.length <= 100,
              )
              return Effect.forEach(bounded, (file) =>
                Effect.gen(function* () {
                  const content = !contentPaths.has(file.filename)
                    ? null
                    : yield* github
                        .getFileContent(
                          repository,
                          file.filename,
                          summary.head.sha,
                        )
                        .pipe(Effect.map((content) => content.slice(0, 4_000)))
                  return {
                    path: file.filename,
                    status: file.status,
                    patch: file.patch?.slice(0, 4_000) ?? null,
                    content,
                  }
                }),
              ).pipe(
                Effect.map((items) => ({
                  items,
                  complete: files.length <= 100,
                })),
              )
            }),
          )
        : null
      const requiredChecks = requirements.facts.has(
        "pull_request.required_checks",
      )
        ? yield* Effect.gen(function* () {
            const [required, runs, statuses] = yield* Effect.all([
              github.listRequiredChecks(repository, summary.base.ref),
              github.listCheckRuns(repository, summary.head.sha),
              github.listCommitStatuses(repository, summary.head.sha),
            ])
            return required.map((check) => {
              const run = runs.find(
                (candidate) =>
                  candidate.name === check.context &&
                  (check.integrationId === null ||
                    candidate.appId === check.integrationId),
              )
              const status = statuses.find(
                (candidate) => candidate.context === check.context,
              )
              return {
                producer:
                  ownAppId._tag === "Some" &&
                  (run?.appId === ownAppId.value ||
                    check.integrationId === ownAppId.value)
                    ? "slopcop"
                    : (run?.producer ??
                      (check.integrationId === null
                        ? null
                        : String(check.integrationId))),
                name: check.context,
                state:
                  run?.conclusion ?? run?.status ?? status?.state ?? "pending",
              }
            })
          })
        : null
      const latestReviews = requirements.facts.has(
        "pull_request.latest_reviews",
      )
        ? yield* github.listPullRequestReviews(repository, summary.number).pipe(
            Effect.map((reviews) => {
              const latest = new Map<string, (typeof reviews)[number]>()
              reviews
                .toSorted((left, right) => left.id - right.id)
                .forEach((review) => {
                  const reviewer = review.reviewer.toLowerCase()
                  if (review.state === "DISMISSED") latest.delete(reviewer)
                  else if (
                    review.state !== "COMMENTED" &&
                    review.state !== "PENDING"
                  )
                    latest.set(reviewer, review)
                })
              return [...latest.values()].map((review) => ({
                reviewer: review.reviewer.toLowerCase(),
                state: review.state,
              }))
            }),
          )
        : null
      return {
        draft: summary.draft,
        title: summary.title,
        body: summary.body,
        baseRef: summary.base.ref,
        headSha: summary.head.sha,
        currentLabels: [...currentLabels],
        changedFiles: changedFileResult?.items ?? null,
        changedFilesComplete: changedFileResult?.complete ?? null,
        requiredChecks,
        latestReviews,
      } satisfies PullRequestFacts
    })
    return { load }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(GitHubClient.layer),
  )
}

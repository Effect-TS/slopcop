import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import * as GitHubWebhookEvent from "@slopcop/domain/GitHub/GitHubWebhookEvent"
import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { RepositoryNotConfigured } from "@slopcop/github/Errors"
import { GitHubAppAuth } from "@slopcop/github/GitHubAppAuth"
import {
  type CheckRun,
  type CommitStatus,
  GitHubClient,
  type PullRequestReview,
  type PullRequestSummary,
  type RequiredCheck,
} from "@slopcop/github/GitHubClient"
import { GitHubPullRequest } from "../../src/GitHub/GitHubPullRequest.ts"
import {
  hasChangesRequested,
  isValidChangesetContent,
  ReadyForReview,
  requiredChecksPass,
} from "../../src/Labeling/ReadyForReview.ts"
import { LabelingRules } from "@slopcop/labeling/LabelingRules"
import { LabelingDecisionsRepo } from "../../src/Labeling/repositories/LabelingDecisionsRepo.ts"

const now = DateTime.fromDateUnsafe(new Date("2026-07-31T00:00:00Z"))
const repository = new GitHubRepository.GitHubRepository({
  id: Schema.decodeUnknownSync(GitHubRepository.GitHubRepositoryId)("repo-1"),
  githubId: Schema.decodeUnknownSync(
    GitHubRepository.GitHubRepositoryExternalId,
  )("2"),
  owner: "Effect-TS",
  repo: "effect",
  isPrivate: false,
  installationId: Schema.decodeUnknownSync(
    GitHubRepository.GitHubInstallationId,
  )("3"),
  enabled: true,
  rulesRevision: 1,
  createdAt: now,
  updatedAt: now,
  deletedAt: Option.none(),
})
const rule = new LabelingRule.LabelingRule({
  id: Schema.decodeUnknownSync(LabelingRule.LabelingRuleId)("ready-rule"),
  repositoryId: repository.id,
  label: "ready for review",
  kind: "ready-for-review",
  instructions: "All required checks pass and a valid changeset is present.",
  mode: "reconcile",
  exclusiveGroup: null,
  enabled: true,
  validationStatus: "valid",
  validatedAt: now,
  version: 1,
  createdAt: now,
  updatedAt: now,
  deletedAt: Option.none(),
})

const event = Schema.decodeUnknownSync(GitHubWebhookEvent.GitHubWebhookEvent)({
  id: "delivery-1",
  name: "status",
  payload: {
    sha: "current-sha",
    state: "success",
    repository: { id: 2, full_name: "Effect-TS/effect" },
    installation: { id: 3 },
  },
})

const reviewEvent = Schema.decodeUnknownSync(
  GitHubWebhookEvent.GitHubWebhookEvent,
)({
  id: "review-delivery-1",
  name: "pull_request_review",
  payload: {
    action: "submitted",
    pull_request: {
      id: 1,
      node_id: "PR_1",
      number: 42,
      title: "Add behavior",
      body: null,
      draft: false,
      user: { login: "octocat" },
      head: { sha: "current-sha" },
      base: { ref: "main" },
    },
    repository: { id: 2, full_name: "Effect-TS/effect" },
    installation: { id: 3 },
  },
})

const validChangeset = `---
"effect": minor
---

Add the new behavior.
`

interface State {
  repositoryConfigured: boolean
  summary: PullRequestSummary
  files: ReadonlyArray<{
    readonly filename: string
    readonly status: "added" | "modified"
  }>
  content: string
  requiredChecks: ReadonlyArray<RequiredCheck>
  checkRuns: ReadonlyArray<CheckRun>
  statuses: ReadonlyArray<CommitStatus>
  reviews: ReadonlyArray<PullRequestReview>
  labels: Set<string>
  labelCalls: Array<{
    add: ReadonlyArray<string>
    remove: ReadonlyArray<string>
  }>
  evidenceCalls: number
  contentCalls: number
}

const initialState = (): State => ({
  repositoryConfigured: true,
  summary: {
    number: 42,
    title: "Add behavior",
    body: null,
    draft: false,
    head: { sha: "current-sha" },
    base: { ref: "main" },
  },
  files: [{ filename: ".changeset/bright-dogs.md", status: "added" }],
  content: validChangeset,
  requiredChecks: [{ context: "Build", integrationId: 15368 }],
  checkRuns: [
    {
      name: "Build",
      status: "completed",
      conclusion: "success",
      appId: 15368,
    },
  ],
  statuses: [],
  reviews: [],
  labels: new Set(),
  labelCalls: [],
  evidenceCalls: 0,
  contentCalls: 0,
})

const unavailable = Effect.die("Unexpected test service call")
const unavailableStream = Stream.die("Unexpected test stream call")

const layer = (state: State) =>
  ReadyForReview.layerNoDeps.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(GitHubClient, {
          getRepositoryLabel: () => unavailable,
          listRepositoryLabels: () => unavailableStream,
          listPullRequestFiles: () => {
            state.evidenceCalls++
            return Stream.fromIterable(state.files)
          },
          listItemLabels: () => unavailableStream,
          addItemLabels: () => unavailable,
          removeItemLabel: () => unavailable,
          listPullRequestsForCommit: () => Effect.succeed([state.summary]),
          listPullRequestReviews: () => Effect.succeed(state.reviews),
          getFileContent: () =>
            Effect.sync(() => {
              state.contentCalls++
              return state.content
            }),
          listRequiredChecks: () => Effect.succeed(state.requiredChecks),
          listCheckRuns: () => Effect.succeed(state.checkRuns),
          listCommitStatuses: () => Effect.succeed(state.statuses),
        }),
        Layer.succeed(GitHubAppAuth, {
          appId: 999,
          getAppToken: () => unavailable,
          getInstallationToken: () => unavailable,
        }),
        Layer.succeed(GitHubPullRequest, {
          resolveRepository: () =>
            state.repositoryConfigured
              ? Effect.succeed(repository)
              : Effect.fail(
                  new RepositoryNotConfigured({
                    repository: repository.slug,
                  }),
                ),
          resolveWebhook: () => unavailable,
          getEvidence: () => unavailable,
          getLabels: () => Effect.succeed(new Set(state.labels)),
          applyLabels: (_pullRequest, changes) =>
            Effect.sync(() => {
              const add = changes.add.filter(
                (label) => !state.labels.has(label),
              )
              const remove = changes.remove.filter((label) =>
                state.labels.has(label),
              )
              if (add.length > 0 || remove.length > 0) {
                state.labelCalls.push({ add, remove })
              }
              add.forEach((label) => state.labels.add(label))
              remove.forEach((label) => state.labels.delete(label))
              return { added: add, removed: remove }
            }),
        }),
        Layer.succeed(LabelingRules, {
          list: () => unavailable,
          get: () => unavailable,
          listAudit: () => unavailable,
          listActivity: () => unavailable,
          create: () => unavailable,
          update: () => unavailable,
          revalidate: () => unavailable,
          disable: () => unavailable,
          remove: () => unavailable,
          getActiveSnapshot: () =>
            Effect.succeed({
              repositoryId: repository.id,
              repository: repository.slug,
              revision: repository.rulesRevision,
              rules: [rule],
            }),
          assertRevision: () => Effect.void,
          listAvailableLabels: () => unavailable,
          validateCandidateLabel: () => unavailable,
          markMissing: () => unavailable,
          revalidateStaleBatch: () => unavailable,
        }),
        Layer.succeed(LabelingDecisionsRepo, {
          record: () => Effect.succeed(null as never),
        }),
      ),
    ),
  )

const run = (
  state: State,
  triggeringEvent: GitHubWebhookEvent.GitHubWebhookEvent = event,
) =>
  Effect.gen(function* () {
    const ready = yield* ReadyForReview
    yield* ready.process(triggeringEvent)
  }).pipe(Effect.provide(layer(state)))

describe("ReadyForReview", () => {
  it.effect(
    "adds the label when required checks pass and a changeset is valid",
    () => {
      const state = initialState()
      return Effect.gen(function* () {
        yield* run(state)
        expect(state.labels.has("ready for review")).toBe(true)
        expect(state.labelCalls).toEqual([
          { add: ["ready for review"], remove: [] },
        ])
      })
    },
  )

  it.effect("does not add without a changeset", () => {
    const state = initialState()
    state.files = []
    return Effect.gen(function* () {
      yield* run(state)
      expect(state.labelCalls).toEqual([])
    })
  })

  it.effect("stops reading changesets after the first valid one", () => {
    const state = initialState()
    state.files = [
      { filename: ".changeset/first.md", status: "added" },
      { filename: ".changeset/second.md", status: "added" },
    ]
    return Effect.gen(function* () {
      yield* run(state)
      expect(state.contentCalls).toBe(1)
    })
  })

  it.effect("skips events for repositories that are not configured", () => {
    const state = initialState()
    state.repositoryConfigured = false
    return Effect.gen(function* () {
      yield* run(state)
      expect(state.evidenceCalls).toBe(0)
      expect(state.labelCalls).toEqual([])
    })
  })

  it.effect("removes the label when one required check fails", () => {
    const state = initialState()
    state.labels.add("ready for review")
    state.checkRuns = [{ ...state.checkRuns[0]!, conclusion: "failure" }]
    return Effect.gen(function* () {
      yield* run(state)
      expect(state.labelCalls).toEqual([
        { add: [], remove: ["ready for review"] },
      ])
    })
  })

  it.effect("does not add while a required check is pending", () => {
    const state = initialState()
    state.checkRuns = [
      { ...state.checkRuns[0]!, status: "in_progress", conclusion: null },
    ]
    return Effect.gen(function* () {
      yield* run(state)
      expect(state.labelCalls).toEqual([])
    })
  })

  it.effect("removes the label as soon as a review requests changes", () => {
    const state = initialState()
    state.labels.add("ready for review")
    state.reviews = [
      {
        id: 1,
        reviewer: "contributor",
        state: "CHANGES_REQUESTED",
      },
    ]
    return Effect.gen(function* () {
      yield* run(state, reviewEvent)
      expect(state.labelCalls).toEqual([
        { add: [], remove: ["ready for review"] },
      ])
    })
  })

  it.effect("ignores stale-SHA events", () => {
    const state = initialState()
    state.summary = {
      ...state.summary,
      head: { sha: "newer-sha" },
    }
    return Effect.gen(function* () {
      yield* run(state)
      expect(state.evidenceCalls).toBe(0)
      expect(state.labelCalls).toEqual([])
    })
  })

  it.effect("skips draft pull requests", () => {
    const state = initialState()
    state.summary = { ...state.summary, draft: true }
    return Effect.gen(function* () {
      yield* run(state)
      expect(state.evidenceCalls).toBe(0)
      expect(state.labelCalls).toEqual([])
    })
  })

  it.effect(
    "removes an existing label when a pull request returns to draft",
    () => {
      const state = initialState()
      state.summary = { ...state.summary, draft: true }
      state.labels.add("ready for review")
      return Effect.gen(function* () {
        yield* run(state)
        expect(state.labelCalls).toEqual([
          { add: [], remove: ["ready for review"] },
        ])
      })
    },
  )

  it.effect("skips generated Changesets release pull requests", () => {
    const state = initialState()
    state.summary = {
      ...state.summary,
      title: "Version Packages",
      body: `[Changesets release](https://github.com/changesets/action) GitHub action
# Releases`,
    }
    state.files = [{ filename: ".changeset/pre.json", status: "modified" }]
    state.labels.add("ready for review")
    return Effect.gen(function* () {
      yield* run(state)
      expect(state.labelCalls).toEqual([])
      expect(state.labels.has("ready for review")).toBe(true)
    })
  })

  it.effect(
    "does not duplicate label calls when a delivery is replayed",
    () => {
      const state = initialState()
      return Effect.gen(function* () {
        yield* run(state)
        yield* run(state)
        expect(state.labelCalls).toHaveLength(1)
      })
    },
  )
})

describe("ready-for-review policy", () => {
  it("uses each reviewer's latest decisive review state", () => {
    expect(
      hasChangesRequested([
        {
          id: 1,
          reviewer: "contributor",
          state: "CHANGES_REQUESTED",
        },
        {
          id: 2,
          reviewer: "contributor",
          state: "COMMENTED",
        },
      ]),
    ).toBe(true)
    expect(
      hasChangesRequested([
        {
          id: 1,
          reviewer: "contributor",
          state: "CHANGES_REQUESTED",
        },
        {
          id: 2,
          reviewer: "contributor",
          state: "APPROVED",
        },
      ]),
    ).toBe(false)
    expect(
      hasChangesRequested([
        {
          id: 1,
          reviewer: "contributor",
          state: "DISMISSED",
        },
      ]),
    ).toBe(false)
  })

  it("treats neutral and skipped conclusions as passing", () => {
    expect(
      requiredChecksPass({
        requiredChecks: [
          { context: "Docs", integrationId: 1 },
          { context: "Optional", integrationId: 1 },
        ],
        checkRuns: [
          {
            name: "Docs",
            status: "completed",
            conclusion: "neutral",
            appId: 1,
          },
          {
            name: "Optional",
            status: "completed",
            conclusion: "skipped",
            appId: 1,
          },
        ],
        statuses: [],
        ownAppId: null,
      }),
    ).toBe(true)
  })

  it("accepts only changesets with a package bump mapping and summary", () => {
    expect(isValidChangesetContent(validChangeset)).toBe(true)
    expect(
      isValidChangesetContent('---\n"effect": invalid\n---\nSummary'),
    ).toBe(false)
    expect(isValidChangesetContent('---\n"effect": patch\n---\n')).toBe(false)
  })
})

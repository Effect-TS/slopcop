import type * as DomainGitHubPullRequest from "@slopcop/domain/GitHub/GitHubPullRequest"
import type {
  CheckRun,
  CommitStatus,
  PullRequestReview,
  RequiredCheck,
} from "@slopcop/github/GitHubClient"
import { parseDocument } from "yaml"

export type ReadyForReviewDisposition = "Skip" | "Apply" | "Reconcile"

export const readyForReviewDisposition = (input: {
  readonly generatedRelease: boolean
  readonly applies: boolean
}): ReadyForReviewDisposition =>
  input.generatedRelease ? "Skip" : input.applies ? "Apply" : "Reconcile"

export const planReadyForReviewLabels = (input: {
  readonly disposition: ReadyForReviewDisposition
  readonly labels: ReadonlyArray<string>
  readonly currentLabels: ReadonlySet<string>
}) => ({
  selected: input.disposition === "Apply",
  changes:
    input.disposition === "Skip"
      ? { add: [], remove: [] }
      : input.disposition === "Apply"
        ? {
            add: input.labels.filter(
              (label) => !input.currentLabels.has(label),
            ),
            remove: [],
          }
        : {
            add: [],
            remove: input.labels.filter((label) =>
              input.currentLabels.has(label),
            ),
          },
})

const PASSING_CHECK_CONCLUSIONS = new Set(["success", "neutral", "skipped"])

export const requiredChecksPass = (input: {
  readonly requiredChecks: ReadonlyArray<RequiredCheck>
  readonly checkRuns: ReadonlyArray<CheckRun>
  readonly statuses: ReadonlyArray<CommitStatus>
  readonly ownAppId: number | null
}) =>
  input.requiredChecks
    .filter(
      (required) =>
        input.ownAppId === null || required.integrationId !== input.ownAppId,
    )
    .every((required) => {
      const checkRun = input.checkRuns.find(
        (check) =>
          check.name === required.context &&
          (required.integrationId === null ||
            check.appId === required.integrationId),
      )
      if (checkRun !== undefined) {
        return (
          checkRun.status === "completed" &&
          checkRun.conclusion !== null &&
          PASSING_CHECK_CONCLUSIONS.has(checkRun.conclusion)
        )
      }
      return (
        required.integrationId === null &&
        input.statuses.some(
          (status) =>
            status.context === required.context && status.state === "success",
        )
      )
    })

export const hasChangesRequested = (
  reviews: ReadonlyArray<PullRequestReview>,
) => {
  const latestByReviewer = new Map<string, PullRequestReview["state"]>()
  for (const review of [...reviews].sort((left, right) => left.id - right.id)) {
    if (review.state === "COMMENTED" || review.state === "PENDING") continue
    latestByReviewer.set(review.reviewer.toLowerCase(), review.state)
  }
  return [...latestByReviewer.values()].some(
    (state) => state === "CHANGES_REQUESTED",
  )
}

const CHANGESET_PATH = /^\.changeset\/[^/]+\.md$/

export const isChangesetCandidate = (filename: string) =>
  CHANGESET_PATH.test(filename) &&
  filename !== ".changeset/README.md" &&
  !/^packages\/.+\/(?:CHANGELOG\.md|package\.json)$/.test(filename)

export const isValidChangesetContent = (content: string) => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(content)
  if (match === null || match[2]?.trim() === "") return false
  const document = parseDocument(match[1] ?? "")
  if (document.errors.length > 0) return false
  const frontmatter: unknown = document.toJS()
  if (
    frontmatter === null ||
    typeof frontmatter !== "object" ||
    Array.isArray(frontmatter)
  )
    return false
  const entries = Object.entries(frontmatter)
  return (
    entries.length > 0 &&
    entries.every(
      ([packageName, bump]) =>
        packageName.trim() !== "" &&
        (bump === "patch" || bump === "minor" || bump === "major"),
    )
  )
}

export const readyForReviewRationale = (input: {
  readonly draft: boolean
  readonly generatedRelease: boolean
  readonly validChangeset: boolean
  readonly checksPass: boolean
  readonly reviewsClear: boolean
}) =>
  input.generatedRelease
    ? "Generated Changesets release pull requests are excluded."
    : input.draft
      ? "The pull request is still a draft."
      : input.validChangeset && input.checksPass && input.reviewsClear
        ? "The pull request is not a draft, has a valid changeset, all required checks pass, and has no active changes-requested review."
        : `The pull request is not ready: valid changeset=${input.validChangeset}, required checks pass=${input.checksPass}, reviews clear=${input.reviewsClear}.`

export type ReadyForReviewFile = DomainGitHubPullRequest.GitHubPullRequestFile

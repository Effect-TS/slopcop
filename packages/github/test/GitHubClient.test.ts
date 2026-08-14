import * as GitHubLabel from "@slopcop/domain/GitHub/GitHubLabel"
import * as GitHubRepository from "@slopcop/domain/GitHub/GitHubRepository"
import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse"
import { GitHubAppAuth } from "../src/GitHubAppAuth.ts"
import { GitHubClient } from "../src/GitHubClient.ts"

const now = DateTime.fromDateUnsafe(new Date("2026-07-23T12:00:00Z"))
const repository = new GitHubRepository.GitHubRepository({
  id: Schema.decodeUnknownSync(GitHubRepository.GitHubRepositoryId)(
    "repository-1",
  ),
  githubId: Schema.decodeUnknownSync(
    GitHubRepository.GitHubRepositoryExternalId,
  )("123"),
  owner: "effect-ts",
  repo: "effect",
  isPrivate: false,
  installationId: Schema.decodeUnknownSync(
    GitHubRepository.GitHubInstallationId,
  )("456"),
  enabled: true,
  rulesRevision: 0,
  createdAt: now,
  updatedAt: now,
  deletedAt: Option.none(),
})
const label = Schema.decodeUnknownSync(GitHubLabel.GitHubLabelName)("bug")

const makeLayer = (
  responses: ReadonlyArray<Response>,
  attempts: Array<number>,
) =>
  GitHubClient.layerNoDeps.pipe(
    Layer.provide([
      Layer.succeed(GitHubAppAuth, {
        appId: 123,
        getAppToken: () => Effect.die("Unexpected App token request"),
        getInstallationToken: () => Effect.succeed(Redacted.make("token")),
      }),
      Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.sync(() => {
            attempts.push(attempts.length + 1)
            const response = responses[attempts.length - 1]
            if (response === undefined) {
              throw new Error("Missing test response")
            }
            return HttpClientResponse.fromWeb(request, response)
          }),
        ),
      ),
    ]),
  )

describe("GitHubClient retries", () => {
  it.effect("retries transient responses according to the schedule", () => {
    const attempts: Array<number> = []
    const layer = makeLayer(
      [
        new Response(null, {
          status: 500,
          headers: { "retry-after": "0" },
        }),
        new Response(null, {
          status: 503,
          headers: { "retry-after": "0" },
        }),
        Response.json({ name: "bug", description: null, color: "ff0000" }),
      ],
      attempts,
    )

    return Effect.gen(function* () {
      const client = yield* GitHubClient
      const result = yield* client.getRepositoryLabel(repository, label)
      expect(Option.getOrUndefined(result)?.name).toBe("bug")
      expect(attempts).toHaveLength(3)
    }).pipe(Effect.provide(layer))
  })

  it.effect("does not retry non-transient responses", () => {
    const attempts: Array<number> = []
    const layer = makeLayer([new Response(null, { status: 400 })], attempts)

    return Effect.gen(function* () {
      const client = yield* GitHubClient
      const error = yield* Effect.flip(
        client.getRepositoryLabel(repository, label),
      )
      expect(error.operation).toBe("GitHubClient.getRepositoryLabel")
      expect(error.status).toBe(400)
      expect(attempts).toHaveLength(1)
    }).pipe(Effect.provide(layer))
  })

  it.effect("fails after three total attempts", () => {
    const attempts: Array<number> = []
    const layer = makeLayer(
      Array.from(
        { length: 3 },
        () =>
          new Response(null, {
            status: 503,
            headers: { "retry-after": "0" },
          }),
      ),
      attempts,
    )

    return Effect.gen(function* () {
      const client = yield* GitHubClient
      const error = yield* Effect.flip(
        client.getRepositoryLabel(repository, label),
      )
      expect(error.status).toBe(503)
      expect(error.retryable).toBe(true)
      expect(attempts).toHaveLength(3)
    }).pipe(Effect.provide(layer))
  })

  it.effect("includes the file path when content loading fails", () => {
    const attempts: Array<number> = []
    const layer = makeLayer([new Response(null, { status: 404 })], attempts)

    return Effect.gen(function* () {
      const client = yield* GitHubClient
      const error = yield* Effect.flip(
        client.getFileContent(repository, "src/example.ts", "head-sha"),
      )
      expect(error.operation).toBe("GitHubClient.getFileContent")
      expect(error.status).toBe(404)
      expect(error.message).toContain("File: 'src/example.ts'.")
      expect(attempts).toHaveLength(1)
    }).pipe(Effect.provide(layer))
  })
  it.effect("reports files whose content is not available inline", () => {
    const attempts: Array<number> = []
    const layer = makeLayer(
      [
        Response.json({
          type: "file",
          encoding: "none",
          content: "",
        }),
      ],
      attempts,
    )

    return Effect.gen(function* () {
      const client = yield* GitHubClient
      const error = yield* Effect.flip(
        client.getFileContent(repository, "large.bin", "head-sha"),
      )
      expect(error.status).toBe(200)
      expect(error.retryable).toBe(false)
      expect(error.message).toContain("did not include inline content")
    }).pipe(Effect.provide(layer))
  })
  it.effect("retains safe response parse diagnostics", () => {
    const attempts: Array<number> = []
    const layer = makeLayer(
      [
        Response.json({
          type: "file",
          encoding: "private-invalid-value",
          content: "private-response-content",
        }),
      ],
      attempts,
    )

    return Effect.gen(function* () {
      const client = yield* GitHubClient
      const error = yield* Effect.flip(
        client.getFileContent(repository, "invalid.txt", "head-sha"),
      )
      expect(error.parseDiagnostic).toContain("encoding")
      expect(error.parseDiagnostic).not.toContain("private-invalid-value")
      expect(JSON.stringify(error)).not.toContain("private-response-content")
    }).pipe(Effect.provide(layer))
  })
})

describe("GitHubClient pagination", () => {
  it.effect(
    "accepts GitHub check runs waiting for protected environments",
    () => {
      const attempts: Array<number> = []
      const layer = makeLayer(
        [
          Response.json({
            check_runs: [
              {
                name: "approval-gate",
                status: "waiting",
                conclusion: null,
                app: { id: 15368, slug: "github-actions" },
              },
            ],
          }),
        ],
        attempts,
      )

      return Effect.gen(function* () {
        const client = yield* GitHubClient
        const runs = yield* client.listCheckRuns(repository, "head-sha")
        expect(runs).toEqual([
          {
            name: "approval-gate",
            status: "waiting",
            conclusion: null,
            appId: 15368,
            producer: "github-actions",
          },
        ])
      }).pipe(Effect.provide(layer))
    },
  )
  it.effect("accepts check runs whose app slug is null", () => {
    const attempts: Array<number> = []
    const layer = makeLayer(
      [
        Response.json({
          check_runs: [
            {
              name: "legacy-check",
              status: "completed",
              conclusion: "success",
              app: { id: 7, slug: null },
            },
          ],
        }),
      ],
      attempts,
    )

    return Effect.gen(function* () {
      const client = yield* GitHubClient
      const runs = yield* client.listCheckRuns(repository, "head-sha")
      expect(runs).toEqual([
        {
          name: "legacy-check",
          status: "completed",
          conclusion: "success",
          appId: 7,
          producer: "7",
        },
      ])
    }).pipe(Effect.provide(layer))
  })

  it.effect(
    "lists only the requested recent open pull request summaries",
    () => {
      const attempts: Array<number> = []
      const layer = makeLayer(
        [
          Response.json(
            [
              {
                number: 42,
                title: "Newest pull request",
                draft: false,
                user: { login: "octocat" },
                updated_at: "2026-07-23T12:00:00Z",
              },
              {
                number: 41,
                title: "Draft pull request",
                draft: true,
                user: null,
                updated_at: null,
              },
            ],
            {
              headers: {
                link: '<https://api.github.com/repos/effect-ts/effect/pulls?page=2>; rel="next"',
              },
            },
          ),
          Response.json([
            {
              number: 40,
              title: "Older pull request",
              draft: false,
            },
            {
              number: 39,
              title: "Outside requested bound",
              draft: false,
            },
          ]),
        ],
        attempts,
      )

      return Effect.gen(function* () {
        const client = yield* GitHubClient
        const candidates = yield* client.listOpenPullRequests(repository, 3)

        expect(candidates).toEqual([
          {
            number: 42,
            title: "Newest pull request",
            draft: false,
            author: "octocat",
            updatedAt: Schema.decodeUnknownSync(Schema.DateTimeUtcFromString)(
              "2026-07-23T12:00:00Z",
            ),
          },
          {
            number: 41,
            title: "Draft pull request",
            draft: true,
            author: null,
            updatedAt: null,
          },
          {
            number: 40,
            title: "Older pull request",
            draft: false,
            author: null,
            updatedAt: null,
          },
        ])
        expect(attempts).toHaveLength(2)
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect("collects required checks from mixed effective-rules pages", () => {
    const attempts: Array<number> = []
    const layer = makeLayer(
      [
        Response.json(
          [
            {
              type: "pull_request",
              parameters: {
                required_approving_review_count: 1,
                dismiss_stale_reviews_on_push: true,
              },
            },
            {
              type: "required_status_checks",
              parameters: {
                required_status_checks: [
                  { context: "Build", integration_id: 1 },
                ],
              },
            },
          ],
          {
            headers: {
              link: '<https://api.github.com/repositories/123/rules/branches/main?page=2>; rel="next"',
            },
          },
        ),
        Response.json([
          {
            type: "required_status_checks",
            parameters: {
              required_status_checks: [
                { context: "Test", integration_id: null },
              ],
            },
          },
        ]),
      ],
      attempts,
    )

    return Effect.gen(function* () {
      const client = yield* GitHubClient
      const checks = yield* client.listRequiredChecks(repository, "main")
      expect(checks).toEqual([
        { context: "Build", integrationId: 1 },
        { context: "Test", integrationId: null },
      ])
      expect(attempts).toHaveLength(2)
    }).pipe(Effect.provide(layer))
  })
})

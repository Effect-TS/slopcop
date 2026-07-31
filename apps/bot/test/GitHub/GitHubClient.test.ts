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
import { GitHubAppAuth } from "../../src/GitHub/GitHubAppAuth.ts"
import { GitHubClient } from "../../src/GitHub/GitHubClient.ts"

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
})

describe("GitHubClient pagination", () => {
  it.effect("collects required checks from every effective-rules page", () => {
    const attempts: Array<number> = []
    const layer = makeLayer(
      [
        Response.json(
          [
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

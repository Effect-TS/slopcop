import { Schema } from "effect"
import * as GitHubAppAuth from "@slopcop/domain/GitHub/GitHubAppAuth"
import * as GitHubLabel from "@slopcop/domain/GitHub/GitHubLabel"
import * as GitHubWebhookEvent from "@slopcop/domain/GitHub/GitHubWebhookEvent"
import * as RepositoryManagement from "@slopcop/domain/GitHub/RepositoryManagement"
import * as LabelingPolicy from "@slopcop/domain/Labeling/LabelingPolicy"
import * as PolicyEvaluation from "@slopcop/domain/Labeling/PolicyEvaluation"
import * as PolicyProgram from "@slopcop/domain/Policy/PolicyProgram"
import * as PolicyProgramSource from "@slopcop/domain/Policy/PolicyProgramSource"
import * as Option from "effect/Option"
import { describe, expect, it } from "vite-plus/test"

const decodes = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  input: unknown,
) => Option.isSome(Schema.decodeUnknownOption(schema)(input))
const policyId = Schema.decodeUnknownSync(PolicyProgram.PolicyId)

describe("domain schemas", () => {
  it("encodes GitHub App JWT claims as JSON", () => {
    expect(
      Schema.encodeSync(GitHubAppAuth.GitHubAppJwtHeaderJson)({
        alg: "RS256",
        typ: "JWT",
      }),
    ).toBe('{"alg":"RS256","typ":"JWT"}')
    expect(
      Schema.encodeSync(GitHubAppAuth.GitHubAppJwtPayloadJson)({
        iat: 100,
        exp: 700,
        iss: "12345",
      }),
    ).toBe('{"iat":100,"exp":700,"iss":"12345"}')
  })

  it("bounds labels and policy names", () => {
    expect(decodes(GitHubLabel.GitHubLabelName, "bug")).toBe(true)
    expect(decodes(GitHubLabel.GitHubLabelName, "x".repeat(51))).toBe(false)
    expect(
      decodes(LabelingPolicy.LabelingPolicyName, "Documentation patrol"),
    ).toBe(true)
    expect(decodes(LabelingPolicy.LabelingPolicyName, "")).toBe(false)
    expect(decodes(LabelingPolicy.LabelingPolicyName, "x".repeat(101))).toBe(
      false,
    )
  })

  it("rejects AI policy nodes", () => {
    expect(
      decodes(PolicyProgram.Condition, {
        _tag: "AiPrompt",
        prompt: "Classify",
        evidence: ["pull_request.title"],
        minimumConfidence: 0.8,
        evaluator: "boolean-policy-v1",
      }),
    ).toBe(false)
    expect(
      decodes(PolicyProgramSource.ConditionSource, {
        aiPrompt: "Classify",
        evidence: ["pull_request.title"],
        minimumConfidence: 0.8,
        evaluator: "boolean-policy-v1",
      }),
    ).toBe(false)
  })

  it("defaults an omitted applicability condition to null", () => {
    const program = Schema.decodeUnknownSync(PolicyProgram.PolicyProgram)({
      target: "pull_request",
      matchesWhen: {
        _tag: "FactPredicate",
        fact: "pull_request.draft",
        operator: "Equals",
        value: false,
      },
    })

    expect(program.appliesWhen).toBeNull()
  })

  it("ignores legacy condition IDs when decoding programs", () => {
    const program = Schema.decodeUnknownSync(PolicyProgram.PolicyProgram)({
      target: "pull_request",
      appliesWhen: null,
      matchesWhen: {
        _tag: "FactPredicate",
        id: "legacy-id",
        fact: "pull_request.draft",
        operator: "Equals",
        value: false,
      },
    })

    expect(program.matchesWhen).not.toHaveProperty("id")
  })

  it("converts semantic policy source to the canonical policy program", () => {
    const source = Schema.decodeUnknownSync(
      PolicyProgramSource.PolicyProgramSource,
    )({
      target: "pull_request",
      appliesWhen: {
        not: {
          fact: "pull_request.draft",
          operator: "Equals",
          value: true,
        },
      },
      matchesWhen: {
        allOf: [
          {
            fact: "pull_request.title",
            operator: "Contains",
            value: "docs",
          },
          {
            fact: "pull_request.changed_files",
            quantifier: "Any",
            item: {
              anyOf: [
                {
                  field: "path",
                  operator: "MatchesGlob",
                  value: "docs/**",
                },
                {
                  field: "content",
                  operator: "ValidChangesetDocument",
                },
              ],
            },
          },
        ],
      },
    })

    expect(PolicyProgramSource.toPolicyProgram(source, policyId)).toEqual({
      target: "pull_request",
      appliesWhen: {
        _tag: "Not",
        condition: {
          _tag: "FactPredicate",
          fact: "pull_request.draft",
          operator: "Equals",
          value: true,
        },
      },
      matchesWhen: {
        _tag: "All",
        conditions: [
          {
            _tag: "FactPredicate",
            fact: "pull_request.title",
            operator: "Contains",
            value: "docs",
          },
          {
            _tag: "CollectionPredicate",
            fact: "pull_request.changed_files",
            quantifier: "Any",
            item: {
              _tag: "Any",
              predicates: [
                {
                  _tag: "Predicate",
                  field: "path",
                  operator: "MatchesGlob",
                  value: "docs/**",
                },
                {
                  _tag: "Predicate",
                  field: "content",
                  operator: "ValidChangesetDocument",
                },
              ],
            },
          },
        ],
      },
    })
  })

  it("round trips canonical programs through semantic policy source", () => {
    const program = Schema.decodeUnknownSync(PolicyProgram.PolicyProgram)({
      target: "pull_request",
      appliesWhen: null,
      matchesWhen: {
        _tag: "PolicyReference",
        policyId: "version-1",
      },
    })

    const source = PolicyProgramSource.fromPolicyProgram(
      program,
      () => "Shared policy",
    )

    expect(source).toEqual({
      target: "pull_request",
      appliesWhen: null,
      matchesWhen: { policy: "Shared policy" },
    })
    expect(
      PolicyProgramSource.toPolicyProgram(source, () => policyId("version-1")),
    ).toEqual(program)
  })

  it("round trips semantic groups for every collection item kind", () => {
    const program = Schema.decodeUnknownSync(PolicyProgram.PolicyProgram)({
      target: "pull_request",
      matchesWhen: {
        _tag: "Any",
        conditions: [
          {
            _tag: "CollectionPredicate",
            fact: "pull_request.required_checks",
            quantifier: "All",
            item: {
              _tag: "All",
              predicates: [
                {
                  _tag: "Predicate",
                  field: "producer",
                  operator: "NotEmpty",
                },
                {
                  _tag: "Predicate",
                  field: "state",
                  operator: "In",
                  value: ["success", "neutral"],
                },
              ],
            },
          },
          {
            _tag: "CollectionPredicate",
            fact: "pull_request.latest_reviews",
            quantifier: "None",
            item: {
              _tag: "Not",
              predicate: {
                _tag: "Predicate",
                field: "reviewer",
                operator: "Equals",
                value: "dependabot[bot]",
              },
            },
          },
        ],
      },
    })

    const source = PolicyProgramSource.fromPolicyProgram(program, String)

    expect(source.matchesWhen).toMatchObject({
      anyOf: [
        { item: { allOf: [{ field: "producer" }, { field: "state" }] } },
        { item: { not: { field: "reviewer" } } },
      ],
    })
    expect(PolicyProgramSource.toPolicyProgram(source, policyId)).toEqual(
      program,
    )
  })

  it("builds stable, human-readable structural node locations", () => {
    const versionId = Schema.decodeUnknownSync(PolicyProgram.PolicyVersionId)(
      "version/1",
    )
    const location = PolicyProgram.policyNodeLocationReference(
      PolicyProgram.policyNodeLocationNot(
        PolicyProgram.policyNodeLocationChild(
          PolicyProgram.policyNodeLocationRoot("matchesWhen"),
          "All",
          1,
        ),
      ),
      policyId("version/1"),
      "appliesWhen",
    )

    expect(location).toEqual({
      root: "matchesWhen",
      path: [
        { _tag: "All", index: 1 },
        { _tag: "Not" },
        {
          _tag: "PolicyReference",
          policyId: versionId,
          root: "appliesWhen",
        },
      ],
    })
    expect(PolicyProgram.policyNodeLocationKey(location)).toBe(
      '["matchesWhen",["All",1],["Not"],["PolicyReference","version/1","appliesWhen"]]',
    )
    expect(PolicyProgram.formatPolicyNodeLocation(location)).toBe(
      "matchesWhen > All child 2 > Not condition > policy 'version/1' appliesWhen",
    )
  })

  it("decodes rule-centric policy evaluations", () => {
    const row = Schema.decodeUnknownSync(PolicyEvaluation.PolicyRuleEvaluation)(
      {
        id: "evaluation-1",
        deliveryId: "delivery-1",
        repositoryId: "repository-1",
        _tag: "PolicyRuleEvaluation",
        ruleId: "rule-1",
        ruleVersion: 1,
        policyId: "policy-1",
        policyVersionId: "version-1",
        target: "pull_request",
        subjectNumber: 1,
        headSha: "abc",
        automationRevision: 1,
        outcome: "Match",
        confidence: 1,
        rationale: "Matched.",
        trace: JSON.stringify([
          {
            location: { root: "matchesWhen", path: [] },
            outcome: "Match",
            rationale: "Matched.",
          },
        ]),
        createdAt: Date.parse("2026-08-10T00:00:00Z"),
      },
    )

    expect(row.trace).toEqual([
      {
        location: { root: "matchesWhen", path: [] },
        outcome: "Match",
        rationale: "Matched.",
      },
    ])
  })

  it("encodes repository summaries without internal identities", () => {
    expect(
      Schema.encodeSync(RepositoryManagement.RepositorySummary)({
        owner: "Effect-TS",
        repo: "effect",
        isPrivate: false,
        enabled: true,
      }),
    ).toEqual({
      owner: "Effect-TS",
      repo: "effect",
      isPrivate: false,
      enabled: true,
    })
  })

  it("accepts edited pull request events with an installation id", () => {
    expect(
      decodes(GitHubWebhookEvent.GitHubWebhookEvent, {
        id: "delivery-1",
        name: "pull_request",
        payload: {
          action: "edited",
          number: 1,
          pull_request: {
            id: 1,
            node_id: "PR_1",
            title: "Update behavior",
            body: null,
            draft: false,
            user: { login: "octocat" },
            head: { sha: "abc123" },
            base: { ref: "main" },
          },
          repository: { id: 2, full_name: "Effect-TS/effect" },
          installation: { id: 3 },
        },
      }),
    ).toBe(true)
  })
})

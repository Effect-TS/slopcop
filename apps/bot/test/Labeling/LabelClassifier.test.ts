import * as LabelClassification from "@slopcop/domain/Labeling/LabelClassification"
import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"
import {
  isGeneratedChangesetsReleasePullRequest,
  validateClassificationOutput,
} from "../../src/Labeling/LabelClassifier.ts"

const ruleId = Schema.decodeUnknownSync(LabelingRule.LabelingRuleId)

const input: LabelClassification.ClassificationInput = {
  subject: {
    type: "pull_request",
    number: 1,
    title: "Fix behavior",
    body: null,
    baseRef: "main",
    headSha: "abc",
    files: [],
  },
  ruleSet: {
    revision: 7,
    rules: [
      {
        id: ruleId("v3"),
        label: "3.0",
        instructions: "v3",
        exclusiveGroup: "version",
      },
      {
        id: ruleId("v4"),
        label: "4.0",
        instructions: "v4",
        exclusiveGroup: "version",
      },
      {
        id: ruleId("bug"),
        label: "bug",
        instructions: "bug",
        exclusiveGroup: null,
      },
    ],
  },
}

const decision = (id: string, applies = false) => ({
  ruleId: id,
  applies,
  confidence: 0.9,
  rationale: "reason",
})

const validate = (output: unknown) =>
  Effect.runPromiseExit(validateClassificationOutput(input, output))

describe("validateClassificationOutput", () => {
  it("accepts exactly one decision for every known rule", async () => {
    const exit = await validate({
      rulesRevision: 7,
      decisions: [decision("v3"), decision("v4", true), decision("bug", true)],
    })
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  it.each([
    [
      "revision",
      {
        rulesRevision: 8,
        decisions: [decision("v3"), decision("v4"), decision("bug")],
      },
    ],
    [
      "unknown ID",
      {
        rulesRevision: 7,
        decisions: [decision("v3"), decision("v4"), decision("other")],
      },
    ],
    [
      "duplicate ID",
      {
        rulesRevision: 7,
        decisions: [decision("v3"), decision("v3"), decision("bug")],
      },
    ],
    [
      "missing ID",
      { rulesRevision: 7, decisions: [decision("v3"), decision("v4")] },
    ],
    [
      "exclusive selections",
      {
        rulesRevision: 7,
        decisions: [
          decision("v3", true),
          decision("v4", true),
          decision("bug"),
        ],
      },
    ],
  ])("rejects an invalid %s", async (_name, output) => {
    const exit = await validate(output)
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("strictly decodes confidence and excess properties", async () => {
    const invalidConfidence = await validate({
      rulesRevision: 7,
      decisions: [
        { ...decision("v3"), confidence: Number.POSITIVE_INFINITY },
        decision("v4"),
        decision("bug"),
      ],
    })
    const excessProperty = await validate({
      rulesRevision: 7,
      decisions: [decision("v3"), decision("v4"), decision("bug")],
      label: "invented",
    })
    expect(Exit.isFailure(invalidConfidence)).toBe(true)
    expect(Exit.isFailure(excessProperty)).toBe(true)
  })

  it("suppresses change-kind decisions for generated Changesets release PRs", async () => {
    const releaseInput: LabelClassification.ClassificationInput = {
      ...input,
      subject: {
        ...input.subject,
        title: "Version Packages (beta)",
        body: "This PR was opened by the [Changesets release](https://github.com/changesets/action) GitHub action.\n\n# Releases",
        files: [
          {
            filename: ".changeset/pre.json",
            status: "modified",
            patch: null,
            patchTruncated: false,
          },
          {
            filename: "packages/effect/CHANGELOG.md",
            status: "modified",
            patch: "Fix a historical bug.",
            patchTruncated: false,
          },
          {
            filename: "packages/effect/package.json",
            status: "modified",
            patch: '"version": "4.0.0-beta.102"',
            patchTruncated: false,
          },
        ],
      },
      ruleSet: {
        ...input.ruleSet,
        rules: input.ruleSet.rules.map((rule) =>
          rule.id === "bug" ? { ...rule, exclusiveGroup: "change-kind" } : rule,
        ),
      },
    }
    const exit = await Effect.runPromiseExit(
      validateClassificationOutput(releaseInput, {
        rulesRevision: 7,
        decisions: [
          decision("v3"),
          decision("v4", true),
          decision("bug", true),
        ],
      }),
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    if (Exit.isSuccess(exit)) {
      expect(exit.value.decisions).toEqual([
        decision("v3"),
        decision("v4", true),
        {
          ...decision("bug"),
          confidence: 1,
          rationale:
            "Generated Changesets release PRs do not introduce the historical changes summarized in their release artifacts.",
        },
      ])
    }
  })

  it("does not identify release PRs that change implementation", () => {
    expect(
      isGeneratedChangesetsReleasePullRequest({
        ...input.subject,
        title: "Version Packages (beta)",
        body: "This PR was opened by the [Changesets release](https://github.com/changesets/action) GitHub action.\n\n# Releases",
        files: [
          {
            filename: "packages/effect/src/Effect.ts",
            status: "modified",
            patch: null,
            patchTruncated: false,
          },
        ],
      }),
    ).toBe(false)
  })
})

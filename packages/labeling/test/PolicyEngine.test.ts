import * as Program from "@slopcop/domain/Policy/PolicyProgram"
import {
  compilePolicyProgram,
  MAX_DEPTH,
  type PolicyResolver,
} from "@slopcop/labeling/PolicyCompiler"
import {
  evaluatePolicyProgram,
  type ProgramResolver,
  type PullRequestFacts,
} from "@slopcop/labeling/PolicyEngine"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

const versionId = Schema.decodeUnknownSync(Program.PolicyVersionId)
const policyId = Schema.decodeUnknownSync(Program.PolicyId)
const context = { repositoryId: "repo-1", policyId: policyId("policy-1") }
const missingResolver: PolicyResolver & ProgramResolver = {
  resolve: () => Effect.succeed(null),
}
const facts: PullRequestFacts = {
  draft: false,
  title: "Fix parser",
  body: "Correct invalid input handling.",
  baseRef: "main",
  headSha: "sha",
  currentLabels: [],
  changedFiles: [
    {
      path: ".changeset/fix.md",
      status: "added",
      patch: null,
      content: '---\n"effect": patch\n---\nFix parsing.',
    },
  ],
  changedFilesComplete: true,
  requiredChecks: [
    { producer: "github-actions", name: "test", state: "success" },
  ],
  latestReviews: [{ reviewer: "alice", state: "APPROVED" }],
}
const leaf = (_label: string, value: boolean): Program.Condition => ({
  _tag: "FactPredicate",
  fact: "pull_request.draft",
  operator: "Equals",
  value,
})
const program = (matchesWhen: Program.Condition): Program.PolicyProgram => ({
  target: "pull_request",
  appliesWhen: null,
  matchesWhen,
})
const evaluate = (
  policy: Program.PolicyProgram,
  options?: {
    readonly resolver?: ProgramResolver
    readonly values?: PullRequestFacts
  },
) =>
  evaluatePolicyProgram({
    program: policy,
    repositoryId: "repo-1",
    facts: options?.values ?? facts,
    resolver: options?.resolver ?? missingResolver,
  })
const resolved = (
  idValue: Program.PolicyId,
  referenced: Program.PolicyProgram,
  repositoryId = "repo-1",
) => ({
  id: versionId(`current:${idValue}`),
  policyId: idValue,
  repositoryId,
  target: referenced.target,
  program: referenced,
})

describe("PolicyProgram schema", () => {
  it("rejects misspelled collection fields", () => {
    expect(() =>
      Schema.decodeUnknownSync(Program.PolicyProgram)({
        target: "pull_request",
        appliesWhen: null,
        matchesWhen: {
          _tag: "CollectionPredicate",
          fact: "pull_request.changed_files",
          quantifier: "Any",
          item: {
            _tag: "Predicate",
            field: "filename",
            operator: "Equals",
            value: "a.ts",
          },
        },
      }),
    ).toThrow()
  })

  it("rejects empty condition and item groups", () => {
    expect(() =>
      Schema.decodeUnknownSync(Program.PolicyProgram)({
        target: "pull_request",
        appliesWhen: null,
        matchesWhen: { _tag: "All", conditions: [] },
      }),
    ).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(Program.ChangedFileItemPredicate)({
        _tag: "Any",
        predicates: [],
      }),
    ).toThrow()
  })
})

describe("PolicyCompiler", () => {
  it.effect("includes reconciliation and concrete check triggers", () =>
    Effect.gen(function* () {
      const compiled = yield* compilePolicyProgram(
        program({
          _tag: "CollectionPredicate",
          fact: "pull_request.required_checks",
          quantifier: "All",
          item: {
            _tag: "Predicate",
            field: "state",
            operator: "Equals",
            value: "success",
          },
        }),
        missingResolver,
        context,
      )
      expect(compiled.triggers).toContain("pull_request:unlabeled")
      expect(compiled.triggers).toContain("check_run:rerequested")
      expect(compiled.triggers).toContain("check_run:completed")
      expect(compiled.triggers).not.toContain("check_suite:requested")
    }),
  )

  it.effect("retains changed-file selectors that require content", () =>
    Effect.gen(function* () {
      const selector: Program.Condition = {
        _tag: "CollectionPredicate",
        fact: "pull_request.changed_files",
        quantifier: "Any",
        item: {
          _tag: "All",
          predicates: [
            {
              _tag: "Predicate",
              field: "path",
              operator: "MatchesGlob",
              value: ".changeset/*.md",
            },
            {
              _tag: "Predicate",
              field: "content",
              operator: "ValidChangesetDocument",
            },
          ],
        },
      }
      const compiled = yield* compilePolicyProgram(
        program(selector),
        missingResolver,
        context,
      )
      expect(compiled.requiresChangedFileContent).toBe(true)
      expect(compiled.changedFileContentSelectors).toEqual([selector])
    }),
  )

  it.effect("counts recursive item predicates toward depth limits", () =>
    Effect.gen(function* () {
      let item: Program.ChangedFileItemPredicate = {
        _tag: "Predicate",
        field: "path",
        operator: "Equals",
        value: "a",
      }
      for (let index = 0; index <= MAX_DEPTH; index++)
        item = { _tag: "Not", predicate: item }
      const error = yield* Effect.flip(
        compilePolicyProgram(
          program({
            _tag: "CollectionPredicate",
            fact: "pull_request.changed_files",
            quantifier: "Any",
            item,
          }),
          missingResolver,
          context,
        ),
      )
      expect(error.reason).toBe("LimitExceeded")
    }),
  )

  it.effect("rejects issue targets", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        compilePolicyProgram(
          { ...program(leaf("draft", false)), target: "issue" },
          missingResolver,
          context,
        ),
      )
      expect(error.reason).toBe("UnsupportedTarget")
    }),
  )

  it.effect("enforces reference repository ownership and target", () =>
    Effect.gen(function* () {
      const ref = policyId("policy-1")
      const root = program({
        _tag: "PolicyReference",
        policyId: ref,
      })
      const ownership = yield* Effect.flip(
        compilePolicyProgram(
          root,
          {
            resolve: () =>
              Effect.succeed(
                resolved(ref, program(leaf("child", false)), "repo-2"),
              ),
          },
          context,
        ),
      )
      expect(ownership.reason).toBe("ReferenceOwnership")
      expect(ownership.location).toEqual({ root: "matchesWhen", path: [] })
      const target = yield* Effect.flip(
        compilePolicyProgram(
          root,
          {
            resolve: () =>
              Effect.succeed(
                resolved(ref, {
                  target: "issue",
                  appliesWhen: null,
                  matchesWhen: leaf("child", false),
                }),
              ),
          },
          context,
        ),
      )
      expect(target.reason).toBe("ReferenceTargetMismatch")
    }),
  )

  it.effect("detects pinned reference cycles", () =>
    Effect.gen(function* () {
      const ref = policyId("cycle")
      const cyclic = program({
        _tag: "PolicyReference",
        policyId: ref,
      })
      const error = yield* Effect.flip(
        compilePolicyProgram(
          cyclic,
          { resolve: () => Effect.succeed(resolved(ref, cyclic)) },
          context,
        ),
      )
      expect(error.reason).toBe("ReferenceCycle")
    }),
  )

  it.effect(
    "does not count a duplicate pinned version against the reference limit",
    () =>
      Effect.gen(function* () {
        const versions = Array.from({ length: 8 }, (_, index) =>
          policyId(`policy-${index}`),
        )
        const first = versions[0]
        if (first === undefined)
          return yield* Effect.die("Missing fixture version")
        const compiled = yield* compilePolicyProgram(
          program({
            _tag: "Any",
            conditions: [...versions, first].map((policyVersionId) => ({
              _tag: "PolicyReference" as const,
              policyId: policyVersionId,
            })),
          }),
          {
            resolve: (policyVersionId) =>
              Effect.succeed(
                resolved(
                  policyVersionId,
                  program(leaf(`leaf-${policyVersionId}`, false)),
                ),
              ),
          },
          context,
        )
        expect(compiled.references).toHaveLength(8)
      }),
  )
})

describe("PolicyEngine composition", () => {
  it.effect("traces exact root and nested node locations", () =>
    Effect.gen(function* () {
      const decision = yield* evaluate(
        program({
          _tag: "All",
          conditions: [
            leaf("not-draft", false),
            { _tag: "Not", condition: leaf("draft", false) },
          ],
        }),
      )

      expect(decision.trace.map((entry) => entry.location)).toEqual([
        {
          root: "matchesWhen",
          path: [{ _tag: "All", index: 0 }],
        },
        {
          root: "matchesWhen",
          path: [{ _tag: "All", index: 1 }, { _tag: "Not" }],
        },
        {
          root: "matchesWhen",
          path: [{ _tag: "All", index: 1 }],
        },
        { root: "matchesWhen", path: [] },
      ])
    }),
  )

  it.effect(
    "evaluates referenced applicability before referenced matching",
    () =>
      Effect.gen(function* () {
        const ref = policyId("applicability")
        const referenced: Program.PolicyProgram = {
          target: "pull_request",
          appliesWhen: leaf("only-drafts", true),
          matchesWhen: leaf("matches", false),
        }
        const decision = yield* evaluate(
          program({
            _tag: "PolicyReference",
            policyId: ref,
          }),
          {
            resolver: {
              resolve: () => Effect.succeed(resolved(ref, referenced)),
            },
          },
        )
        expect(decision.outcome).toBe("Abstain")
        expect(decision.trace.map((entry) => entry.location)).toEqual([
          {
            root: "matchesWhen",
            path: [
              {
                _tag: "PolicyReference",
                policyId: ref,
                root: "appliesWhen",
              },
            ],
          },
          { root: "matchesWhen", path: [] },
        ])
      }),
  )

  it.effect("rejects runtime references crossing repository ownership", () =>
    Effect.gen(function* () {
      const ref = policyId("foreign")
      const error = yield* Effect.flip(
        evaluate(
          program({
            _tag: "PolicyReference",
            policyId: ref,
          }),
          {
            resolver: {
              resolve: () =>
                Effect.succeed(
                  resolved(ref, program(leaf("child", false)), "repo-2"),
                ),
            },
          },
        ),
      )
      expect(error).toMatchObject({ stage: "reference" })
    }),
  )

  it.effect("rejects runtime reference cycles and excessive depth", () =>
    Effect.gen(function* () {
      const one = policyId("one")
      const two = policyId("two")
      const three = policyId("three")
      const four = policyId("four")
      const five = policyId("five")
      const referencing = (referenceId: Program.PolicyId, _label: string) =>
        program({
          _tag: "PolicyReference",
          policyId: referenceId,
        })
      const root = referencing(one, "root-ref")
      const resolver: ProgramResolver = {
        resolve: (requested) =>
          Effect.succeed(
            requested === one
              ? resolved(one, referencing(two, "ref-two"))
              : requested === two
                ? resolved(two, referencing(three, "ref-three"))
                : requested === three
                  ? resolved(three, referencing(four, "ref-four"))
                  : requested === four
                    ? resolved(four, referencing(five, "ref-five"))
                    : null,
          ),
      }
      const cycle = yield* Effect.flip(
        evaluate(root, {
          resolver: {
            resolve: (requested) => Effect.succeed(resolved(requested, root)),
          },
        }),
      )
      expect(cycle).toMatchObject({
        stage: "reference",
        message: expect.stringContaining("cycle"),
      })
      const depth = yield* Effect.flip(evaluate(root, { resolver }))
      expect(depth).toMatchObject({
        stage: "reference",
        message: expect.stringContaining("depth 4"),
      })
    }),
  )

  it.effect(
    "does not let missing item values satisfy NotEquals or NotEmpty",
    () =>
      Effect.gen(function* () {
        const condition = (
          operator: "NotEquals" | "NotEmpty",
        ): Program.Condition => ({
          _tag: "CollectionPredicate",
          fact: "pull_request.changed_files",
          quantifier: "Any",
          item:
            operator === "NotEquals"
              ? { _tag: "Predicate", field: "content", operator, value: "x" }
              : { _tag: "Predicate", field: "content", operator },
        })
        for (const operator of ["NotEquals", "NotEmpty"] as const) {
          const decision = yield* evaluate(program(condition(operator)), {
            values: {
              ...facts,
              changedFiles: [
                { path: "binary", status: "added", patch: null, content: null },
              ],
            },
          })
          expect(decision.outcome).toBe("NoMatch")
        }
      }),
  )
})

describe("ready-for-review generic predicates", () => {
  const changeset: Program.Condition = {
    _tag: "CollectionPredicate",
    fact: "pull_request.changed_files",
    quantifier: "Any",
    item: {
      _tag: "All",
      predicates: [
        {
          _tag: "Predicate",
          field: "status",
          operator: "Equals",
          value: "added",
        },
        {
          _tag: "Predicate",
          field: "path",
          operator: "MatchesGlob",
          value: ".changeset/*.md",
        },
        {
          _tag: "Predicate",
          field: "path",
          operator: "NotEquals",
          value: ".changeset/README.md",
        },
        {
          _tag: "Predicate",
          field: "content",
          operator: "ValidChangesetDocument",
        },
      ],
    },
  }
  const readyProgram: Program.PolicyProgram = {
    target: "pull_request",
    appliesWhen: {
      _tag: "Not",
      condition: {
        _tag: "All",
        conditions: [
          {
            _tag: "FactPredicate",
            fact: "pull_request.title",
            operator: "Equals",
            value: "Version Packages",
          },
          {
            _tag: "FactPredicate",
            fact: "pull_request.body",
            operator: "Contains",
            value:
              "[Changesets release](https://github.com/changesets/action) GitHub action",
          },
          {
            _tag: "FactPredicate",
            fact: "pull_request.body",
            operator: "Contains",
            value: "# Releases",
          },
          {
            _tag: "CollectionPredicate",
            fact: "pull_request.changed_files",
            quantifier: "Any",
            item: {
              _tag: "Predicate",
              field: "path",
              operator: "NotEmpty",
            },
          },
          {
            _tag: "CollectionPredicate",
            fact: "pull_request.changed_files",
            quantifier: "All",
            item: {
              _tag: "Any",
              predicates: [
                {
                  _tag: "Predicate",
                  field: "path",
                  operator: "Equals",
                  value: ".changeset/pre.json",
                },
                {
                  _tag: "Predicate",
                  field: "path",
                  operator: "MatchesGlob",
                  value: "packages/*/CHANGELOG.md",
                },
                {
                  _tag: "Predicate",
                  field: "path",
                  operator: "MatchesGlob",
                  value: "packages/*/package.json",
                },
              ],
            },
          },
        ],
      },
    },
    matchesWhen: {
      _tag: "All",
      conditions: [
        { ...leaf("ready-not-draft", false) },
        changeset,
        {
          _tag: "CollectionPredicate",
          fact: "pull_request.required_checks",
          quantifier: "All",
          item: {
            _tag: "Any",
            predicates: [
              {
                _tag: "Predicate",
                field: "producer",
                operator: "Equals",
                value: "slopcop",
              },
              {
                _tag: "Predicate",
                field: "state",
                operator: "In",
                value: ["success", "neutral", "skipped"],
              },
            ],
          },
        },
        {
          _tag: "CollectionPredicate",
          fact: "pull_request.latest_reviews",
          quantifier: "None",
          item: {
            _tag: "Predicate",
            field: "state",
            operator: "Equals",
            value: "CHANGES_REQUESTED",
          },
        },
      ],
    },
  }

  it.effect("requires valid bump entries and a nonempty body", () =>
    Effect.gen(function* () {
      expect((yield* evaluate(program(changeset))).outcome).toBe("Match")
      for (const bump of ["patch", "minor", "major"]) {
        const decision = yield* evaluate(program(changeset), {
          values: {
            ...facts,
            changedFiles: [
              {
                path: `.changeset/${bump}.md`,
                status: "added",
                patch: null,
                content: `---\n"effect": ${bump}\n---\nRelease notes.`,
              },
            ],
          },
        })
        expect(decision.outcome).toBe("Match")
      }
      const invalid = [
        '---\n"effect": invalid\n---\nBody',
        '---\n"effect": patch\n---\n',
        "---\n---\nBody",
      ]
      for (const content of invalid) {
        const decision = yield* evaluate(program(changeset), {
          values: {
            ...facts,
            changedFiles: [
              {
                path: ".changeset/a.md",
                status: "added",
                patch: null,
                content,
              },
            ],
          },
        })
        expect(decision.outcome).toBe("NoMatch")
      }
    }),
  )

  it.effect("excludes the changeset README", () =>
    Effect.gen(function* () {
      const decision = yield* evaluate(program(changeset), {
        values: {
          ...facts,
          changedFiles: [
            {
              path: ".changeset/README.md",
              status: "added",
              patch: null,
              content: '---\n"effect": patch\n---\nDocumentation.',
            },
          ],
        },
      })
      expect(decision.outcome).toBe("NoMatch")
    }),
  )

  it.effect("ignores failing SlopCop checks but requires other checks", () =>
    Effect.gen(function* () {
      const ignored = yield* evaluate(readyProgram, {
        values: {
          ...facts,
          requiredChecks: [
            { producer: "slopcop", name: "labels", state: "failure" },
            { producer: "github-actions", name: "test", state: "success" },
          ],
        },
      })
      expect(ignored.outcome).toBe("Match")
      const failed = yield* evaluate(readyProgram, {
        values: {
          ...facts,
          requiredChecks: [
            { producer: "github-actions", name: "test", state: "failure" },
          ],
        },
      })
      expect(failed.outcome).toBe("NoMatch")
    }),
  )

  it.effect("blocks outstanding changes-requested reviews", () =>
    Effect.gen(function* () {
      const decision = yield* evaluate(readyProgram, {
        values: {
          ...facts,
          latestReviews: [{ reviewer: "alice", state: "CHANGES_REQUESTED" }],
        },
      })
      expect(decision.outcome).toBe("NoMatch")
    }),
  )

  it.effect("abstains for exact generated release markers and artifacts", () =>
    Effect.gen(function* () {
      const decision = yield* evaluate(readyProgram, {
        values: {
          ...facts,
          title: "Version Packages",
          body: "[Changesets release](https://github.com/changesets/action) GitHub action\n# Releases",
          changedFiles: [
            {
              path: "packages/effect/package.json",
              status: "modified",
              patch: null,
              content: null,
            },
            {
              path: "packages/effect/CHANGELOG.md",
              status: "modified",
              patch: null,
              content: null,
            },
          ],
        },
      })
      expect(decision.outcome).toBe("Abstain")
    }),
  )

  it.effect(
    "does not classify an empty changed-file set as a generated release",
    () =>
      Effect.gen(function* () {
        const decision = yield* evaluate(readyProgram, {
          values: {
            ...facts,
            title: "Version Packages",
            body: "[Changesets release](https://github.com/changesets/action) GitHub action\n# Releases",
            changedFiles: [],
          },
        })
        expect(decision.outcome).toBe("NoMatch")
      }),
  )
})

describe("incomplete changed-file collections", () => {
  const collection = (
    quantifier: "Any" | "All" | "None",
  ): Program.Condition => ({
    _tag: "CollectionPredicate",
    fact: "pull_request.changed_files",
    quantifier,
    item: {
      _tag: "Predicate",
      field: "path",
      operator: "Equals",
      value: "match.ts",
    },
  })

  it.effect("only allows a positive Any result from a truncated prefix", () =>
    Effect.gen(function* () {
      const values = {
        ...facts,
        changedFilesComplete: false,
        changedFiles: [
          { path: "other.ts", status: "modified", patch: null, content: null },
        ],
      }
      expect(
        (yield* evaluate(program(collection("Any")), { values })).outcome,
      ).toBe("Abstain")
      expect(
        (yield* evaluate(program(collection("All")), { values })).outcome,
      ).toBe("Abstain")
      expect(
        (yield* evaluate(program(collection("None")), { values })).outcome,
      ).toBe("Abstain")
      expect(
        (yield* evaluate(program(collection("Any")), {
          values: {
            ...values,
            changedFiles: [
              {
                path: "match.ts",
                status: "modified",
                patch: null,
                content: null,
              },
            ],
          },
        })).outcome,
      ).toBe("Match")
    }),
  )
})

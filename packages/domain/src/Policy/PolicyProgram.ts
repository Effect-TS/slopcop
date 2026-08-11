import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

export const PolicyTarget = Schema.Literals(["pull_request", "issue"])
export type PolicyTarget = typeof PolicyTarget.Type
export const ExecutablePolicyTarget = Schema.Literal("pull_request")

export const PolicyVersionId = Schema.String.pipe(
  Schema.brand("PolicyVersionId"),
)
export type PolicyVersionId = typeof PolicyVersionId.Type

export const PullRequestScalarFact = Schema.Literals([
  "pull_request.draft",
  "pull_request.title",
  "pull_request.body",
  "pull_request.base_ref",
  "pull_request.head_sha",
  "pull_request.current_labels",
])
export const PullRequestCollectionFact = Schema.Literals([
  "pull_request.changed_files",
  "pull_request.required_checks",
  "pull_request.latest_reviews",
])
export const PullRequestFact = Schema.Union([
  PullRequestScalarFact,
  PullRequestCollectionFact,
])
export type PullRequestFact = typeof PullRequestFact.Type

const NonEmptyConditions = <A, I>(schema: Schema.Codec<A, I>) =>
  Schema.Array(schema).check(Schema.isMinLength(1))
const StringValueOperator = Schema.Literals([
  "Equals",
  "NotEquals",
  "Contains",
  "MatchesGlob",
])
const StringSetOperator = Schema.Literal("In")
const EmptyOperator = Schema.Literals(["IsEmpty", "NotEmpty"])
const EqualityOperator = Schema.Literals(["Equals", "NotEquals"])

const stringLeaf = <Field extends Schema.Codec<string, string>>(field: Field) =>
  Schema.Union([
    Schema.Struct({
      _tag: Schema.Literal("Predicate"),
      field,
      operator: StringValueOperator,
      value: Schema.String,
    }),
    Schema.Struct({
      _tag: Schema.Literal("Predicate"),
      field,
      operator: StringSetOperator,
      value: Schema.Array(Schema.String).check(Schema.isMinLength(1)),
    }),
    Schema.Struct({
      _tag: Schema.Literal("Predicate"),
      field,
      operator: EmptyOperator,
    }),
  ])
const equalityLeaf = <Field extends Schema.Codec<string, string>>(
  field: Field,
) =>
  Schema.Union([
    Schema.Struct({
      _tag: Schema.Literal("Predicate"),
      field,
      operator: EqualityOperator,
      value: Schema.String,
    }),
    Schema.Struct({
      _tag: Schema.Literal("Predicate"),
      field,
      operator: StringSetOperator,
      value: Schema.Array(Schema.String).check(Schema.isMinLength(1)),
    }),
  ])

type StringItemPredicate<Field extends string> =
  | {
      readonly _tag: "Predicate"
      readonly field: Field
      readonly operator: "Equals" | "NotEquals" | "Contains" | "MatchesGlob"
      readonly value: string
    }
  | {
      readonly _tag: "Predicate"
      readonly field: Field
      readonly operator: "In"
      readonly value: ReadonlyArray<string>
    }
  | {
      readonly _tag: "Predicate"
      readonly field: Field
      readonly operator: "IsEmpty" | "NotEmpty"
    }
type EqualityItemPredicate<Field extends string> =
  | {
      readonly _tag: "Predicate"
      readonly field: Field
      readonly operator: "Equals" | "NotEquals"
      readonly value: string
    }
  | {
      readonly _tag: "Predicate"
      readonly field: Field
      readonly operator: "In"
      readonly value: ReadonlyArray<string>
    }

export type ChangedFileItemPredicate =
  | {
      readonly _tag: "All" | "Any"
      readonly predicates: ReadonlyArray<ChangedFileItemPredicate>
    }
  | { readonly _tag: "Not"; readonly predicate: ChangedFileItemPredicate }
  | StringItemPredicate<"path">
  | EqualityItemPredicate<"status">
  | StringItemPredicate<"content">
  | {
      readonly _tag: "Predicate"
      readonly field: "content"
      readonly operator: "ValidChangesetDocument"
    }
export const ChangedFileItemPredicate: Schema.Codec<
  ChangedFileItemPredicate,
  unknown
> = Schema.suspend(() =>
  Schema.Union([
    Schema.Struct({
      _tag: Schema.Literals(["All", "Any"]),
      predicates: NonEmptyConditions(ChangedFileItemPredicate),
    }),
    Schema.Struct({
      _tag: Schema.Literal("Not"),
      predicate: ChangedFileItemPredicate,
    }),
    stringLeaf(Schema.Literal("path")),
    equalityLeaf(Schema.Literal("status")),
    Schema.Union([
      stringLeaf(Schema.Literal("content")),
      Schema.Struct({
        _tag: Schema.Literal("Predicate"),
        field: Schema.Literal("content"),
        operator: Schema.Literal("ValidChangesetDocument"),
      }),
    ]),
  ]),
)

export type CheckItemPredicate =
  | {
      readonly _tag: "All" | "Any"
      readonly predicates: ReadonlyArray<CheckItemPredicate>
    }
  | { readonly _tag: "Not"; readonly predicate: CheckItemPredicate }
  | StringItemPredicate<"producer" | "name" | "state">
export const CheckItemPredicate: Schema.Codec<CheckItemPredicate, unknown> =
  Schema.suspend(() =>
    Schema.Union([
      Schema.Struct({
        _tag: Schema.Literals(["All", "Any"]),
        predicates: NonEmptyConditions(CheckItemPredicate),
      }),
      Schema.Struct({
        _tag: Schema.Literal("Not"),
        predicate: CheckItemPredicate,
      }),
      stringLeaf(Schema.Literals(["producer", "name", "state"])),
    ]),
  )

export type ReviewItemPredicate =
  | {
      readonly _tag: "All" | "Any"
      readonly predicates: ReadonlyArray<ReviewItemPredicate>
    }
  | { readonly _tag: "Not"; readonly predicate: ReviewItemPredicate }
  | StringItemPredicate<"reviewer" | "state">
export const ReviewItemPredicate: Schema.Codec<ReviewItemPredicate, unknown> =
  Schema.suspend(() =>
    Schema.Union([
      Schema.Struct({
        _tag: Schema.Literals(["All", "Any"]),
        predicates: NonEmptyConditions(ReviewItemPredicate),
      }),
      Schema.Struct({
        _tag: Schema.Literal("Not"),
        predicate: ReviewItemPredicate,
      }),
      stringLeaf(Schema.Literals(["reviewer", "state"])),
    ]),
  )

export const AiEvaluator = Schema.Literal("boolean-policy-v1")
export type AiEvaluator = typeof AiEvaluator.Type

const BooleanFactPredicate = Schema.Struct({
  _tag: Schema.Literal("FactPredicate"),
  fact: Schema.Literal("pull_request.draft"),
  operator: EqualityOperator,
  value: Schema.Boolean,
})
const StringFactPredicate = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal("FactPredicate"),
    fact: Schema.Literals([
      "pull_request.title",
      "pull_request.body",
      "pull_request.base_ref",
      "pull_request.head_sha",
    ]),
    operator: StringValueOperator,
    value: Schema.String,
  }),
  Schema.Struct({
    _tag: Schema.Literal("FactPredicate"),
    fact: Schema.Literals([
      "pull_request.title",
      "pull_request.body",
      "pull_request.base_ref",
      "pull_request.head_sha",
    ]),
    operator: StringSetOperator,
    value: Schema.Array(Schema.String).check(Schema.isMinLength(1)),
  }),
  Schema.Struct({
    _tag: Schema.Literal("FactPredicate"),
    fact: Schema.Literals([
      "pull_request.title",
      "pull_request.body",
      "pull_request.base_ref",
      "pull_request.head_sha",
    ]),
    operator: EmptyOperator,
  }),
])
const CurrentLabelsPredicate = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal("FactPredicate"),
    fact: Schema.Literal("pull_request.current_labels"),
    operator: Schema.Literal("Contains"),
    value: Schema.String,
  }),
  Schema.Struct({
    _tag: Schema.Literal("FactPredicate"),
    fact: Schema.Literal("pull_request.current_labels"),
    operator: EmptyOperator,
  }),
])

export type Condition =
  | {
      readonly _tag: "All" | "Any"
      readonly conditions: ReadonlyArray<Condition>
    }
  | {
      readonly _tag: "Not"
      readonly condition: Condition
    }
  | typeof BooleanFactPredicate.Type
  | typeof StringFactPredicate.Type
  | typeof CurrentLabelsPredicate.Type
  | {
      readonly _tag: "CollectionPredicate"
      readonly fact: "pull_request.changed_files"
      readonly quantifier: "Any" | "All" | "None"
      readonly item: ChangedFileItemPredicate
    }
  | {
      readonly _tag: "CollectionPredicate"
      readonly fact: "pull_request.required_checks"
      readonly quantifier: "Any" | "All" | "None"
      readonly item: CheckItemPredicate
    }
  | {
      readonly _tag: "CollectionPredicate"
      readonly fact: "pull_request.latest_reviews"
      readonly quantifier: "Any" | "All" | "None"
      readonly item: ReviewItemPredicate
    }
  | {
      readonly _tag: "AiPrompt"
      readonly prompt: string
      readonly evidence: ReadonlyArray<PullRequestFact>
      readonly minimumConfidence: number
      readonly evaluator: AiEvaluator
    }
  | {
      readonly _tag: "PolicyReference"
      readonly policyVersionId: PolicyVersionId
    }

export const Condition: Schema.Codec<Condition, unknown> = Schema.suspend(() =>
  Schema.Union([
    Schema.Struct({
      _tag: Schema.Literals(["All", "Any"]),
      conditions: NonEmptyConditions(Condition),
    }),
    Schema.Struct({
      _tag: Schema.Literal("Not"),
      condition: Condition,
    }),
    BooleanFactPredicate,
    StringFactPredicate,
    CurrentLabelsPredicate,
    Schema.Struct({
      _tag: Schema.Literal("CollectionPredicate"),
      fact: Schema.Literal("pull_request.changed_files"),
      quantifier: Schema.Literals(["Any", "All", "None"]),
      item: ChangedFileItemPredicate,
    }),
    Schema.Struct({
      _tag: Schema.Literal("CollectionPredicate"),
      fact: Schema.Literal("pull_request.required_checks"),
      quantifier: Schema.Literals(["Any", "All", "None"]),
      item: CheckItemPredicate,
    }),
    Schema.Struct({
      _tag: Schema.Literal("CollectionPredicate"),
      fact: Schema.Literal("pull_request.latest_reviews"),
      quantifier: Schema.Literals(["Any", "All", "None"]),
      item: ReviewItemPredicate,
    }),
    Schema.Struct({
      _tag: Schema.Literal("AiPrompt"),
      prompt: Schema.String.check(
        Schema.isMinLength(1),
        Schema.isMaxLength(4_000),
      ),
      evidence: Schema.Array(PullRequestFact).check(
        Schema.isMinLength(1),
        Schema.isMaxLength(8),
      ),
      minimumConfidence: Schema.Finite.check(
        Schema.isBetween({ minimum: 0, maximum: 1 }),
      ),
      evaluator: AiEvaluator,
    }),
    Schema.Struct({
      _tag: Schema.Literal("PolicyReference"),
      policyVersionId: PolicyVersionId,
    }),
  ]),
)

export const PolicyAppliesWhen = Schema.NullOr(Condition).pipe(
  Schema.withDecodingDefaultKey(Effect.succeed(null)),
)
export const PolicyProgram = Schema.Struct({
  target: PolicyTarget,
  appliesWhen: PolicyAppliesWhen,
  matchesWhen: Condition,
})
export type PolicyProgram = typeof PolicyProgram.Type

export const PolicyOutcome = Schema.Literals(["Match", "NoMatch", "Abstain"])
export type PolicyOutcome = typeof PolicyOutcome.Type
export const PolicyEvaluationOutcome = Schema.Literals([
  "Match",
  "NoMatch",
  "Abstain",
  "Error",
])
export const PolicyNodeRoot = Schema.Literals(["appliesWhen", "matchesWhen"])
export type PolicyNodeRoot = typeof PolicyNodeRoot.Type
export const PolicyNodeLocationSegment = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literals(["All", "Any"]),
    index: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  }),
  Schema.Struct({ _tag: Schema.Literal("Not") }),
  Schema.Struct({
    _tag: Schema.Literal("PolicyReference"),
    policyVersionId: PolicyVersionId,
    root: PolicyNodeRoot,
  }),
])
export type PolicyNodeLocationSegment = typeof PolicyNodeLocationSegment.Type
export const PolicyNodeLocation = Schema.Struct({
  root: PolicyNodeRoot,
  path: Schema.Array(PolicyNodeLocationSegment),
})
export type PolicyNodeLocation = typeof PolicyNodeLocation.Type

export const policyNodeLocationRoot = (
  root: PolicyNodeRoot,
): PolicyNodeLocation => ({ root, path: [] })
export const policyNodeLocationChild = (
  location: PolicyNodeLocation,
  group: "All" | "Any",
  index: number,
): PolicyNodeLocation => ({
  ...location,
  path: [...location.path, { _tag: group, index }],
})
export const policyNodeLocationNot = (
  location: PolicyNodeLocation,
): PolicyNodeLocation => ({
  ...location,
  path: [...location.path, { _tag: "Not" }],
})
export const policyNodeLocationReference = (
  location: PolicyNodeLocation,
  policyVersionId: PolicyVersionId,
  root: PolicyNodeRoot,
): PolicyNodeLocation => ({
  ...location,
  path: [...location.path, { _tag: "PolicyReference", policyVersionId, root }],
})
export const policyNodeLocationKey = (location: PolicyNodeLocation): string =>
  JSON.stringify([
    location.root,
    ...location.path.map((segment) => {
      switch (segment._tag) {
        case "All":
        case "Any":
          return [segment._tag, segment.index]
        case "Not":
          return [segment._tag]
        case "PolicyReference":
          return [segment._tag, segment.policyVersionId, segment.root]
      }
    }),
  ])
export const formatPolicyNodeLocation = (
  location: PolicyNodeLocation,
): string =>
  [
    location.root,
    ...location.path.map((segment) => {
      switch (segment._tag) {
        case "All":
        case "Any":
          return `${segment._tag} child ${segment.index + 1}`
        case "Not":
          return "Not condition"
        case "PolicyReference":
          return `policy version '${segment.policyVersionId}' ${segment.root}`
      }
    }),
  ].join(" > ")
export const PolicyNodeTrace = Schema.Struct({
  location: PolicyNodeLocation,
  outcome: PolicyOutcome,
  rationale: Schema.String,
})
export type PolicyNodeTrace = typeof PolicyNodeTrace.Type
export const PolicyEvaluationResult = Schema.Struct({
  outcome: PolicyOutcome,
  confidence: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  rationale: Schema.String,
  trace: Schema.Array(PolicyNodeTrace).check(Schema.isMaxLength(64)),
})
export type PolicyEvaluationResult = typeof PolicyEvaluationResult.Type

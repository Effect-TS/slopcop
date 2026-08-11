import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as PolicyProgram from "./PolicyProgram.ts"

const NonEmpty = <A, I>(schema: Schema.Codec<A, I>) =>
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
      field,
      operator: StringValueOperator,
      value: Schema.String,
    }),
    Schema.Struct({
      field,
      operator: StringSetOperator,
      value: Schema.Array(Schema.String).check(Schema.isMinLength(1)),
    }),
    Schema.Struct({ field, operator: EmptyOperator }),
  ])
const equalityLeaf = <Field extends Schema.Codec<string, string>>(
  field: Field,
) =>
  Schema.Union([
    Schema.Struct({ field, operator: EqualityOperator, value: Schema.String }),
    Schema.Struct({
      field,
      operator: StringSetOperator,
      value: Schema.Array(Schema.String).check(Schema.isMinLength(1)),
    }),
  ])

type WithoutTag<A> = A extends { readonly _tag: string }
  ? Omit<A, "_tag">
  : never
type PredicateSource<A> = WithoutTag<Extract<A, { readonly _tag: "Predicate" }>>

export type ChangedFileItemPredicateSource =
  | { readonly allOf: ReadonlyArray<ChangedFileItemPredicateSource> }
  | { readonly anyOf: ReadonlyArray<ChangedFileItemPredicateSource> }
  | { readonly not: ChangedFileItemPredicateSource }
  | PredicateSource<PolicyProgram.ChangedFileItemPredicate>
export const ChangedFileItemPredicateSource: Schema.Codec<
  ChangedFileItemPredicateSource,
  unknown
> = Schema.suspend(() =>
  Schema.Union([
    Schema.Struct({ allOf: NonEmpty(ChangedFileItemPredicateSource) }),
    Schema.Struct({ anyOf: NonEmpty(ChangedFileItemPredicateSource) }),
    Schema.Struct({ not: ChangedFileItemPredicateSource }),
    stringLeaf(Schema.Literal("path")),
    equalityLeaf(Schema.Literal("status")),
    Schema.Union([
      stringLeaf(Schema.Literal("content")),
      Schema.Struct({
        field: Schema.Literal("content"),
        operator: Schema.Literal("ValidChangesetDocument"),
      }),
    ]),
  ]),
)

export type CheckItemPredicateSource =
  | { readonly allOf: ReadonlyArray<CheckItemPredicateSource> }
  | { readonly anyOf: ReadonlyArray<CheckItemPredicateSource> }
  | { readonly not: CheckItemPredicateSource }
  | PredicateSource<PolicyProgram.CheckItemPredicate>
export const CheckItemPredicateSource: Schema.Codec<
  CheckItemPredicateSource,
  unknown
> = Schema.suspend(() =>
  Schema.Union([
    Schema.Struct({ allOf: NonEmpty(CheckItemPredicateSource) }),
    Schema.Struct({ anyOf: NonEmpty(CheckItemPredicateSource) }),
    Schema.Struct({ not: CheckItemPredicateSource }),
    stringLeaf(Schema.Literals(["producer", "name", "state"])),
  ]),
)

export type ReviewItemPredicateSource =
  | { readonly allOf: ReadonlyArray<ReviewItemPredicateSource> }
  | { readonly anyOf: ReadonlyArray<ReviewItemPredicateSource> }
  | { readonly not: ReviewItemPredicateSource }
  | PredicateSource<PolicyProgram.ReviewItemPredicate>
export const ReviewItemPredicateSource: Schema.Codec<
  ReviewItemPredicateSource,
  unknown
> = Schema.suspend(() =>
  Schema.Union([
    Schema.Struct({ allOf: NonEmpty(ReviewItemPredicateSource) }),
    Schema.Struct({ anyOf: NonEmpty(ReviewItemPredicateSource) }),
    Schema.Struct({ not: ReviewItemPredicateSource }),
    stringLeaf(Schema.Literals(["reviewer", "state"])),
  ]),
)

const BooleanFactPredicateSource = Schema.Struct({
  fact: Schema.Literal("pull_request.draft"),
  operator: EqualityOperator,
  value: Schema.Boolean,
})
const StringFactPredicateSource = Schema.Union([
  Schema.Struct({
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
    fact: Schema.Literals([
      "pull_request.title",
      "pull_request.body",
      "pull_request.base_ref",
      "pull_request.head_sha",
    ]),
    operator: EmptyOperator,
  }),
])
const CurrentLabelsPredicateSource = Schema.Union([
  Schema.Struct({
    fact: Schema.Literal("pull_request.current_labels"),
    operator: Schema.Literal("Contains"),
    value: Schema.String,
  }),
  Schema.Struct({
    fact: Schema.Literal("pull_request.current_labels"),
    operator: EmptyOperator,
  }),
])

type FactPredicateSource = WithoutTag<
  Extract<PolicyProgram.Condition, { readonly _tag: "FactPredicate" }>
>

export type ConditionSource =
  | { readonly allOf: ReadonlyArray<ConditionSource> }
  | { readonly anyOf: ReadonlyArray<ConditionSource> }
  | { readonly not: ConditionSource }
  | FactPredicateSource
  | {
      readonly fact: "pull_request.changed_files"
      readonly quantifier: "Any" | "All" | "None"
      readonly item: ChangedFileItemPredicateSource
    }
  | {
      readonly fact: "pull_request.required_checks"
      readonly quantifier: "Any" | "All" | "None"
      readonly item: CheckItemPredicateSource
    }
  | {
      readonly fact: "pull_request.latest_reviews"
      readonly quantifier: "Any" | "All" | "None"
      readonly item: ReviewItemPredicateSource
    }
  | { readonly policy: string }

export const ConditionSource: Schema.Codec<ConditionSource, unknown> =
  Schema.suspend(() =>
    Schema.Union([
      Schema.Struct({ allOf: NonEmpty(ConditionSource) }),
      Schema.Struct({ anyOf: NonEmpty(ConditionSource) }),
      Schema.Struct({ not: ConditionSource }),
      BooleanFactPredicateSource,
      StringFactPredicateSource,
      CurrentLabelsPredicateSource,
      Schema.Struct({
        fact: Schema.Literal("pull_request.changed_files"),
        quantifier: Schema.Literals(["Any", "All", "None"]),
        item: ChangedFileItemPredicateSource,
      }),
      Schema.Struct({
        fact: Schema.Literal("pull_request.required_checks"),
        quantifier: Schema.Literals(["Any", "All", "None"]),
        item: CheckItemPredicateSource,
      }),
      Schema.Struct({
        fact: Schema.Literal("pull_request.latest_reviews"),
        quantifier: Schema.Literals(["Any", "All", "None"]),
        item: ReviewItemPredicateSource,
      }),
      Schema.Struct({ policy: Schema.String.check(Schema.isMinLength(1)) }),
    ]),
  )

export const PolicyAppliesWhenSource = Schema.NullOr(ConditionSource).pipe(
  Schema.withDecodingDefaultKey(Effect.succeed(null)),
)
export const PolicyProgramSource = Schema.Struct({
  target: PolicyProgram.PolicyTarget,
  appliesWhen: PolicyAppliesWhenSource,
  matchesWhen: ConditionSource,
})
export type PolicyProgramSource = typeof PolicyProgramSource.Type

const toChangedFileItemPredicate = (
  source: ChangedFileItemPredicateSource,
): PolicyProgram.ChangedFileItemPredicate => {
  if ("allOf" in source)
    return {
      _tag: "All",
      predicates: source.allOf.map(toChangedFileItemPredicate),
    }
  if ("anyOf" in source)
    return {
      _tag: "Any",
      predicates: source.anyOf.map(toChangedFileItemPredicate),
    }
  if ("not" in source)
    return { _tag: "Not", predicate: toChangedFileItemPredicate(source.not) }
  return { _tag: "Predicate", ...source }
}

const toCheckItemPredicate = (
  source: CheckItemPredicateSource,
): PolicyProgram.CheckItemPredicate => {
  if ("allOf" in source)
    return { _tag: "All", predicates: source.allOf.map(toCheckItemPredicate) }
  if ("anyOf" in source)
    return { _tag: "Any", predicates: source.anyOf.map(toCheckItemPredicate) }
  if ("not" in source)
    return { _tag: "Not", predicate: toCheckItemPredicate(source.not) }
  return { _tag: "Predicate", ...source }
}

const toReviewItemPredicate = (
  source: ReviewItemPredicateSource,
): PolicyProgram.ReviewItemPredicate => {
  if ("allOf" in source)
    return { _tag: "All", predicates: source.allOf.map(toReviewItemPredicate) }
  if ("anyOf" in source)
    return { _tag: "Any", predicates: source.anyOf.map(toReviewItemPredicate) }
  if ("not" in source)
    return { _tag: "Not", predicate: toReviewItemPredicate(source.not) }
  return { _tag: "Predicate", ...source }
}

const toCondition = (
  source: ConditionSource,
  resolvePolicy: (name: string) => PolicyProgram.PolicyId,
): PolicyProgram.Condition => {
  if ("allOf" in source)
    return {
      _tag: "All",
      conditions: source.allOf.map((condition) =>
        toCondition(condition, resolvePolicy),
      ),
    }
  if ("anyOf" in source)
    return {
      _tag: "Any",
      conditions: source.anyOf.map((condition) =>
        toCondition(condition, resolvePolicy),
      ),
    }
  if ("not" in source)
    return {
      _tag: "Not",
      condition: toCondition(source.not, resolvePolicy),
    }
  if ("policy" in source)
    return {
      _tag: "PolicyReference",
      policyId: resolvePolicy(source.policy),
    }
  if ("quantifier" in source) {
    switch (source.fact) {
      case "pull_request.changed_files":
        return {
          _tag: "CollectionPredicate",
          ...source,
          item: toChangedFileItemPredicate(source.item),
        }
      case "pull_request.required_checks":
        return {
          _tag: "CollectionPredicate",
          ...source,
          item: toCheckItemPredicate(source.item),
        }
      case "pull_request.latest_reviews":
        return {
          _tag: "CollectionPredicate",
          ...source,
          item: toReviewItemPredicate(source.item),
        }
    }
  }
  return { _tag: "FactPredicate", ...source }
}

export const toPolicyProgram = (
  source: PolicyProgramSource,
  resolvePolicy: (name: string) => PolicyProgram.PolicyId,
): PolicyProgram.PolicyProgram => ({
  target: source.target,
  appliesWhen:
    source.appliesWhen === null
      ? null
      : toCondition(source.appliesWhen, resolvePolicy),
  matchesWhen: toCondition(source.matchesWhen, resolvePolicy),
})

const fromChangedFileItemPredicate = (
  predicate: PolicyProgram.ChangedFileItemPredicate,
): ChangedFileItemPredicateSource => {
  switch (predicate._tag) {
    case "All":
      return { allOf: predicate.predicates.map(fromChangedFileItemPredicate) }
    case "Any":
      return { anyOf: predicate.predicates.map(fromChangedFileItemPredicate) }
    case "Not":
      return { not: fromChangedFileItemPredicate(predicate.predicate) }
    case "Predicate": {
      const { _tag: _, ...source } = predicate
      return source
    }
  }
}

const fromCheckItemPredicate = (
  predicate: PolicyProgram.CheckItemPredicate,
): CheckItemPredicateSource => {
  switch (predicate._tag) {
    case "All":
      return { allOf: predicate.predicates.map(fromCheckItemPredicate) }
    case "Any":
      return { anyOf: predicate.predicates.map(fromCheckItemPredicate) }
    case "Not":
      return { not: fromCheckItemPredicate(predicate.predicate) }
    case "Predicate": {
      const { _tag: _, ...source } = predicate
      return source
    }
  }
}

const fromReviewItemPredicate = (
  predicate: PolicyProgram.ReviewItemPredicate,
): ReviewItemPredicateSource => {
  switch (predicate._tag) {
    case "All":
      return { allOf: predicate.predicates.map(fromReviewItemPredicate) }
    case "Any":
      return { anyOf: predicate.predicates.map(fromReviewItemPredicate) }
    case "Not":
      return { not: fromReviewItemPredicate(predicate.predicate) }
    case "Predicate": {
      const { _tag: _, ...source } = predicate
      return source
    }
  }
}

const fromCondition = (condition: PolicyProgram.Condition): ConditionSource => {
  switch (condition._tag) {
    case "All":
      return { allOf: condition.conditions.map(fromCondition) }
    case "Any":
      return { anyOf: condition.conditions.map(fromCondition) }
    case "Not":
      return { not: fromCondition(condition.condition) }
    case "FactPredicate": {
      const { _tag: _, ...source } = condition
      return source
    }
    case "CollectionPredicate": {
      const { _tag: _, ...source } = condition
      switch (source.fact) {
        case "pull_request.changed_files":
          return { ...source, item: fromChangedFileItemPredicate(source.item) }
        case "pull_request.required_checks":
          return { ...source, item: fromCheckItemPredicate(source.item) }
        case "pull_request.latest_reviews":
          return { ...source, item: fromReviewItemPredicate(source.item) }
      }
    }
    case "PolicyReference":
      return { policy: condition.policyId }
  }
}

export const fromPolicyProgram = (
  program: PolicyProgram.PolicyProgram,
  formatPolicy: (id: PolicyProgram.PolicyId) => string,
): PolicyProgramSource => {
  const formatCondition = (
    condition: PolicyProgram.Condition,
  ): ConditionSource => {
    if (condition._tag === "PolicyReference")
      return { policy: formatPolicy(condition.policyId) }
    switch (condition._tag) {
      case "All":
        return { allOf: condition.conditions.map(formatCondition) }
      case "Any":
        return { anyOf: condition.conditions.map(formatCondition) }
      case "Not":
        return { not: formatCondition(condition.condition) }
      default:
        return fromCondition(condition)
    }
  }
  return {
    target: program.target,
    appliesWhen:
      program.appliesWhen === null
        ? null
        : formatCondition(program.appliesWhen),
    matchesWhen: formatCondition(program.matchesWhen),
  }
}

const conditionPolicyNames = (
  condition: ConditionSource,
): ReadonlyArray<string> => {
  if ("policy" in condition) return [condition.policy]
  if ("allOf" in condition) return condition.allOf.flatMap(conditionPolicyNames)
  if ("anyOf" in condition) return condition.anyOf.flatMap(conditionPolicyNames)
  if ("not" in condition) return conditionPolicyNames(condition.not)
  return []
}

export const referencedPolicyNames = (
  source: PolicyProgramSource,
): ReadonlyArray<string> => [
  ...(source.appliesWhen === null
    ? []
    : conditionPolicyNames(source.appliesWhen)),
  ...conditionPolicyNames(source.matchesWhen),
]

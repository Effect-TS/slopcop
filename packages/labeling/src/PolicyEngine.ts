import * as Program from "@slopcop/domain/Policy/PolicyProgram"
import { MAX_REFERENCE_DEPTH } from "@slopcop/labeling/PolicyCompiler"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import { parseDocument } from "yaml"

export interface ChangedFileObservation {
  readonly path: string
  readonly status: string
  readonly patch: string | null
  readonly content: string | null
}
export interface CheckObservation {
  readonly producer: string | null
  readonly name: string
  readonly state: string
}
export interface ReviewObservation {
  readonly reviewer: string
  readonly state: string
}
export interface PullRequestFacts {
  readonly draft: boolean
  readonly title: string
  readonly body: string | null
  readonly baseRef: string
  readonly headSha: string
  readonly currentLabels: ReadonlyArray<string>
  readonly changedFiles: ReadonlyArray<ChangedFileObservation> | null
  readonly changedFilesComplete: boolean | null
  readonly requiredChecks: ReadonlyArray<CheckObservation> | null
  readonly latestReviews: ReadonlyArray<ReviewObservation> | null
}
export interface ResolvedRuntimePolicyVersion {
  readonly id: Program.PolicyVersionId
  readonly policyId: string
  readonly repositoryId: string
  readonly target: Program.PolicyTarget
  readonly program: Program.PolicyProgram
}
export interface ProgramResolver {
  readonly resolve: (
    id: Program.PolicyVersionId,
  ) => Effect.Effect<ResolvedRuntimePolicyVersion | null, unknown>
}
export class PolicyOperationalError extends Data.TaggedError(
  "PolicyOperationalError",
)<{
  readonly stage: "reference"
  readonly location: Program.PolicyNodeLocation
  readonly retryable: boolean
  readonly message: string
  readonly cause: unknown
}> {}
type NodeResult = {
  readonly outcome: Program.PolicyOutcome
  readonly confidence: number
  readonly rationale: string
}
type Evaluated =
  | { readonly _tag: "Result"; readonly value: NodeResult }
  | { readonly _tag: "Failure"; readonly error: PolicyOperationalError }
const result = (
  outcome: Program.PolicyOutcome,
  rationale: string,
  confidence = 1,
): NodeResult => ({ outcome, rationale, confidence })
const evaluated = (value: NodeResult): Evaluated => ({ _tag: "Result", value })

const safeGlob = (pattern: string, value: string) => {
  if (pattern.length > 200 || value.length > 1_000) return false
  let patternIndex = 0
  let valueIndex = 0
  let star = -1
  let mark = 0
  while (valueIndex < value.length) {
    if (
      patternIndex < pattern.length &&
      (pattern[patternIndex] === "?" ||
        pattern[patternIndex] === value[valueIndex])
    ) {
      patternIndex++
      valueIndex++
    } else if (patternIndex < pattern.length && pattern[patternIndex] === "*") {
      star = patternIndex++
      mark = valueIndex
    } else if (star >= 0) {
      patternIndex = star + 1
      valueIndex = ++mark
    } else return false
  }
  while (pattern[patternIndex] === "*") patternIndex++
  return patternIndex === pattern.length
}

const validChangeset = (value: unknown) => {
  if (typeof value !== "string" || value.length > 4_000) return false
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(value)
  if (match === null || match[2]?.trim() === "") return false
  const document = parseDocument(match[1] ?? "")
  const decoded: unknown = document.toJS()
  if (
    document.errors.length > 0 ||
    decoded === null ||
    typeof decoded !== "object" ||
    Array.isArray(decoded)
  )
    return false
  const entries = Object.values(decoded)
  return (
    entries.length > 0 &&
    entries.every(
      (entry) => entry === "patch" || entry === "minor" || entry === "major",
    )
  )
}

type ItemOperator =
  | "Equals"
  | "NotEquals"
  | "Contains"
  | "MatchesGlob"
  | "In"
  | "IsEmpty"
  | "NotEmpty"
  | "ValidChangesetDocument"
const compare = (
  actual: unknown,
  operator: ItemOperator,
  expected?: string | boolean | ReadonlyArray<string>,
) => {
  if (actual === undefined) return false
  if (actual === null && (operator === "NotEquals" || operator === "NotEmpty"))
    return false
  switch (operator) {
    case "Equals":
      return actual === expected
    case "NotEquals":
      return actual !== expected
    case "Contains":
      return typeof actual === "string" && typeof expected === "string"
        ? actual.includes(expected)
        : Array.isArray(actual) &&
            typeof expected === "string" &&
            actual.includes(expected)
    case "MatchesGlob":
      return (
        typeof actual === "string" &&
        typeof expected === "string" &&
        safeGlob(expected, actual)
      )
    case "In":
      return (
        Array.isArray(expected) &&
        typeof actual === "string" &&
        expected.includes(actual)
      )
    case "IsEmpty":
      return (
        actual === null ||
        actual === "" ||
        (Array.isArray(actual) && actual.length === 0)
      )
    case "NotEmpty":
      return (
        actual !== null &&
        actual !== "" &&
        (!Array.isArray(actual) || actual.length > 0)
      )
    case "ValidChangesetDocument":
      return validChangeset(actual)
  }
}

type ItemPredicate =
  | Program.ChangedFileItemPredicate
  | Program.CheckItemPredicate
  | Program.ReviewItemPredicate
const itemValue = (item: unknown, field: string): unknown => {
  if (typeof item !== "object" || item === null || Array.isArray(item))
    return undefined
  return field in item ? item[field as keyof typeof item] : undefined
}
const itemMatches = (item: unknown, predicate: ItemPredicate): boolean => {
  switch (predicate._tag) {
    case "All":
      return predicate.predicates.every((child) => itemMatches(item, child))
    case "Any":
      return predicate.predicates.some((child) => itemMatches(item, child))
    case "Not":
      return !itemMatches(item, predicate.predicate)
    case "Predicate":
      return compare(
        itemValue(item, predicate.field),
        predicate.operator,
        "value" in predicate ? predicate.value : undefined,
      )
  }
}

const fact = (
  facts: PullRequestFacts,
  key: Program.PullRequestFact,
): unknown => {
  switch (key) {
    case "pull_request.draft":
      return facts.draft
    case "pull_request.title":
      return facts.title
    case "pull_request.body":
      return facts.body
    case "pull_request.base_ref":
      return facts.baseRef
    case "pull_request.head_sha":
      return facts.headSha
    case "pull_request.current_labels":
      return facts.currentLabels
    case "pull_request.changed_files":
      return facts.changedFiles
    case "pull_request.required_checks":
      return facts.requiredChecks
    case "pull_request.latest_reviews":
      return facts.latestReviews
  }
}

export const evaluatePolicyProgram = Effect.fn("PolicyEngine.evaluate")(
  function* (input: {
    readonly program: Program.PolicyProgram
    readonly repositoryId: string
    readonly facts: PullRequestFacts
    readonly resolver: ProgramResolver
  }) {
    const trace: Array<Program.PolicyNodeTrace> = []
    const activeReferences = new Set<Program.PolicyVersionId>()

    const evaluateProgram = (
      program: Program.PolicyProgram,
      appliesLocation: Program.PolicyNodeLocation,
      matchesLocation: Program.PolicyNodeLocation,
    ): Effect.Effect<Evaluated> =>
      Effect.gen(function* () {
        if (program.appliesWhen !== null) {
          const applies = yield* evaluate(program.appliesWhen, appliesLocation)
          if (applies._tag === "Failure") return applies
          if (applies.value.outcome !== "Match")
            return evaluated(
              result(
                applies.value.outcome === "NoMatch"
                  ? "Abstain"
                  : applies.value.outcome,
                applies.value.outcome === "NoMatch"
                  ? "Policy applicability did not match."
                  : applies.value.rationale,
                applies.value.confidence,
              ),
            )
        }
        return yield* evaluate(program.matchesWhen, matchesLocation)
      })

    const evaluate = (
      node: Program.Condition,
      location: Program.PolicyNodeLocation,
    ): Effect.Effect<Evaluated> =>
      Effect.gen(function* () {
        let value: Evaluated | undefined
        switch (node._tag) {
          case "FactPredicate": {
            const actual = fact(input.facts, node.fact)
            value = evaluated(
              result(
                compare(
                  actual,
                  node.operator,
                  "value" in node ? node.value : undefined,
                )
                  ? "Match"
                  : "NoMatch",
                `Fact '${node.fact}' evaluated '${node.operator}'.`,
              ),
            )
            break
          }
          case "CollectionPredicate": {
            const actual = fact(input.facts, node.fact)
            if (!Array.isArray(actual))
              value = evaluated(
                result(
                  "Abstain",
                  `Collection fact '${node.fact}' is unavailable.`,
                ),
              )
            else {
              const matches = actual.map((item) => itemMatches(item, node.item))
              const incomplete =
                node.fact === "pull_request.changed_files" &&
                input.facts.changedFilesComplete === false
              const matched =
                node.quantifier === "Any"
                  ? matches.some(Boolean)
                  : node.quantifier === "All"
                    ? matches.every(Boolean)
                    : matches.every((entry) => !entry)
              value = evaluated(
                incomplete && !(node.quantifier === "Any" && matched)
                  ? result(
                      "Abstain",
                      `Collection '${node.fact}' is incomplete.`,
                    )
                  : result(
                      matched ? "Match" : "NoMatch",
                      `Collection '${node.fact}' evaluated '${node.quantifier}'.`,
                    ),
              )
            }
            break
          }
          case "Not": {
            const child = yield* evaluate(
              node.condition,
              Program.policyNodeLocationNot(location),
            )
            value =
              child._tag === "Failure"
                ? child
                : evaluated(
                    child.value.outcome === "Match"
                      ? result(
                          "NoMatch",
                          "Negated match.",
                          child.value.confidence,
                        )
                      : child.value.outcome === "NoMatch"
                        ? result(
                            "Match",
                            "Negated non-match.",
                            child.value.confidence,
                          )
                        : child.value,
                  )
            break
          }
          case "All":
          case "Any": {
            const values: Array<NodeResult> = []
            let failure: PolicyOperationalError | null = null
            for (const [index, childNode] of node.conditions.entries()) {
              const child = yield* evaluate(
                childNode,
                Program.policyNodeLocationChild(location, node._tag, index),
              )
              if (child._tag === "Failure") {
                failure ??= child.error
                continue
              }
              values.push(child.value)
              if (node._tag === "All" && child.value.outcome === "NoMatch") {
                value = evaluated(
                  result(
                    "NoMatch",
                    "All did not match.",
                    Math.min(...values.map((entry) => entry.confidence)),
                  ),
                )
                break
              }
              if (node._tag === "Any" && child.value.outcome === "Match") {
                value = evaluated(
                  result(
                    "Match",
                    "Any matched.",
                    Math.max(...values.map((entry) => entry.confidence)),
                  ),
                )
                break
              }
            }
            if (value === undefined) {
              if (failure !== null) value = { _tag: "Failure", error: failure }
              else {
                const abstain = values.find(
                  (entry) => entry.outcome === "Abstain",
                )
                const confidence =
                  node._tag === "All"
                    ? Math.min(...values.map((entry) => entry.confidence))
                    : Math.max(...values.map((entry) => entry.confidence))
                value = evaluated(
                  abstain === undefined
                    ? result(
                        node._tag === "All" ? "Match" : "NoMatch",
                        node._tag === "All"
                          ? "All matched."
                          : "Any did not match.",
                        confidence,
                      )
                    : result("Abstain", abstain.rationale, confidence),
                )
              }
            }
            break
          }
          case "PolicyReference": {
            if (
              activeReferences.has(node.policyVersionId) ||
              activeReferences.size >= MAX_REFERENCE_DEPTH
            ) {
              value = {
                _tag: "Failure",
                error: new PolicyOperationalError({
                  stage: "reference",
                  location,
                  retryable: false,
                  message: activeReferences.has(node.policyVersionId)
                    ? `Policy reference cycle includes '${node.policyVersionId}'.`
                    : `Policy references exceed depth ${MAX_REFERENCE_DEPTH}.`,
                  cause: null,
                }),
              }
              break
            }
            const resolved = yield* input.resolver
              .resolve(node.policyVersionId)
              .pipe(
                Effect.match({
                  onFailure: (cause): Evaluated => ({
                    _tag: "Failure",
                    error: new PolicyOperationalError({
                      stage: "reference",
                      location,
                      retryable: false,
                      message: `Policy version '${node.policyVersionId}' could not be resolved.`,
                      cause,
                    }),
                  }),
                  onSuccess: (version) => version,
                }),
              )
            if (resolved !== null && "_tag" in resolved) value = resolved
            else if (resolved === null)
              value = {
                _tag: "Failure",
                error: new PolicyOperationalError({
                  stage: "reference",
                  location,
                  retryable: false,
                  message: `Pinned policy version '${node.policyVersionId}' is unavailable.`,
                  cause: null,
                }),
              }
            else if (
              resolved.repositoryId !== input.repositoryId ||
              resolved.target !== input.program.target ||
              resolved.program.target !== input.program.target
            )
              value = {
                _tag: "Failure",
                error: new PolicyOperationalError({
                  stage: "reference",
                  location,
                  retryable: false,
                  message: `Pinned policy version '${node.policyVersionId}' violates repository or target ownership.`,
                  cause: null,
                }),
              }
            else {
              activeReferences.add(node.policyVersionId)
              value = yield* evaluateProgram(
                resolved.program,
                Program.policyNodeLocationReference(
                  location,
                  node.policyVersionId,
                  "appliesWhen",
                ),
                Program.policyNodeLocationReference(
                  location,
                  node.policyVersionId,
                  "matchesWhen",
                ),
              ).pipe(
                Effect.ensuring(
                  Effect.sync(() =>
                    activeReferences.delete(node.policyVersionId),
                  ),
                ),
              )
            }
            break
          }
        }
        if (value === undefined)
          return yield* Effect.die(
            `Policy node at '${Program.formatPolicyNodeLocation(location)}' was not evaluated.`,
          )
        if (value._tag === "Result" && trace.length < 64)
          trace.push({
            location,
            outcome: value.value.outcome,
            rationale: value.value.rationale,
          })
        return value
      })

    const final = yield* evaluateProgram(
      input.program,
      Program.policyNodeLocationRoot("appliesWhen"),
      Program.policyNodeLocationRoot("matchesWhen"),
    )
    if (final._tag === "Failure") return yield* final.error
    return { ...final.value, trace }
  },
)

import * as Program from "@slopcop/domain/Policy/PolicyProgram"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"

export const MAX_DEPTH = 8
export const MAX_LOCAL_NODES = 64
export const MAX_EXPANDED_NODES = 256
export const MAX_REFERENCES = 8
export const MAX_REFERENCE_DEPTH = 4
export const MAX_AI_NODES = 1

const RECONCILIATION_TRIGGERS = [
  "pull_request:opened",
  "pull_request:reopened",
  "pull_request:synchronize",
  "pull_request:edited",
  "pull_request:ready_for_review",
  "pull_request:converted_to_draft",
  "pull_request:labeled",
  "pull_request:unlabeled",
] as const
const FACT_TRIGGERS: Readonly<
  Record<Program.PullRequestFact, ReadonlyArray<string>>
> = {
  "pull_request.draft": RECONCILIATION_TRIGGERS,
  "pull_request.title": RECONCILIATION_TRIGGERS,
  "pull_request.body": RECONCILIATION_TRIGGERS,
  "pull_request.base_ref": RECONCILIATION_TRIGGERS,
  "pull_request.head_sha": RECONCILIATION_TRIGGERS,
  "pull_request.current_labels": RECONCILIATION_TRIGGERS,
  "pull_request.changed_files": RECONCILIATION_TRIGGERS,
  "pull_request.required_checks": [
    ...RECONCILIATION_TRIGGERS,
    "check_run:created",
    "check_run:rerequested",
    "check_run:completed",
    "check_suite:requested",
    "check_suite:rerequested",
    "check_suite:completed",
    "status:*",
  ],
  "pull_request.latest_reviews": [
    ...RECONCILIATION_TRIGGERS,
    "pull_request_review:submitted",
    "pull_request_review:dismissed",
  ],
}

export class PolicyCompileError extends Data.TaggedError("PolicyCompileError")<{
  readonly reason:
    | "UnsupportedTarget"
    | "TargetMismatch"
    | "LimitExceeded"
    | "EmptyGroup"
    | "MissingReference"
    | "ReferenceCycle"
    | "ReferenceOwnership"
    | "ReferenceTargetMismatch"
  readonly message: string
  readonly location?: Program.PolicyNodeLocation
}> {}

export interface ResolvedPolicyVersion {
  readonly id: Program.PolicyVersionId
  readonly policyId: string
  readonly repositoryId: string
  readonly target: Program.PolicyTarget
  readonly program: Program.PolicyProgram
}
export interface PolicyVersionResolver {
  readonly resolve: (
    id: Program.PolicyVersionId,
  ) => Effect.Effect<ResolvedPolicyVersion | null, unknown>
}
export interface PolicyCompileContext {
  readonly repositoryId: string
  readonly policyId?: string
}
export interface CompiledPolicyProgram {
  readonly program: Program.PolicyProgram
  readonly facts: ReadonlyArray<Program.PullRequestFact>
  readonly triggers: ReadonlyArray<string>
  readonly references: ReadonlyArray<Program.PolicyVersionId>
  readonly nodeCount: number
  readonly expandedNodeCount: number
  readonly requiresChangedFileContent: boolean
  readonly aiNodeCount: number
}

type ItemPredicate =
  | Program.ChangedFileItemPredicate
  | Program.CheckItemPredicate
  | Program.ReviewItemPredicate

export const compilePolicyProgram = Effect.fn("PolicyCompiler.compile")(
  function* (
    program: Program.PolicyProgram,
    resolver: PolicyVersionResolver,
    context: PolicyCompileContext,
  ) {
    if (program.target !== "pull_request")
      return yield* new PolicyCompileError({
        reason: "UnsupportedTarget",
        message:
          "Issue policies are not supported yet. Use target 'pull_request'.",
      })

    const facts = new Set<Program.PullRequestFact>()
    const references = new Set<Program.PolicyVersionId>()
    let localNodes = 0
    let expandedNodes = 0
    let aiNodes = 0
    let requiresChangedFileContent = false

    const count = (
      depth: number,
      local: boolean,
      location: Program.PolicyNodeLocation,
    ) =>
      Effect.gen(function* () {
        expandedNodes++
        if (local) localNodes++
        if (
          depth > MAX_DEPTH ||
          localNodes > MAX_LOCAL_NODES ||
          expandedNodes > MAX_EXPANDED_NODES
        )
          return yield* new PolicyCompileError({
            reason: "LimitExceeded",
            message:
              "Policy exceeds depth 8, 64 local nodes, or 256 expanded nodes.",
            location,
          })
      })

    const visitItem = (
      item: ItemPredicate,
      depth: number,
      local: boolean,
      location: Program.PolicyNodeLocation,
    ): Effect.Effect<void, PolicyCompileError> =>
      Effect.gen(function* () {
        yield* count(depth, local, location)
        switch (item._tag) {
          case "All":
          case "Any":
            if (item.predicates.length === 0)
              return yield* new PolicyCompileError({
                reason: "EmptyGroup",
                message: `${item._tag} item groups must contain at least one predicate.`,
                location,
              })
            yield* Effect.forEach(
              item.predicates,
              (child) => visitItem(child, depth + 1, local, location),
              { discard: true },
            )
            return
          case "Not":
            return yield* visitItem(item.predicate, depth + 1, local, location)
          case "Predicate":
            if (item.field === "content") requiresChangedFileContent = true
            return
        }
      })

    const visitProgram = (
      current: Program.PolicyProgram,
      programKey: string,
      depth: number,
      referenceDepth: number,
      stack: ReadonlySet<string>,
      local: boolean,
      appliesLocation: Program.PolicyNodeLocation,
      matchesLocation: Program.PolicyNodeLocation,
    ): Effect.Effect<void, PolicyCompileError> =>
      Effect.gen(function* () {
        if (current.target !== program.target)
          return yield* new PolicyCompileError({
            reason: "ReferenceTargetMismatch",
            message: `Referenced program '${programKey}' targets '${current.target}', expected '${program.target}'.`,
          })
        const visit = (
          condition: Program.Condition,
          nodeDepth: number,
          location: Program.PolicyNodeLocation,
        ): Effect.Effect<void, PolicyCompileError> =>
          Effect.gen(function* () {
            yield* count(nodeDepth, local, location)
            switch (condition._tag) {
              case "All":
              case "Any":
                if (condition.conditions.length === 0)
                  return yield* new PolicyCompileError({
                    reason: "EmptyGroup",
                    message: `${condition._tag} groups must contain at least one condition.`,
                    location,
                  })
                yield* Effect.forEach(
                  condition.conditions,
                  (child, index) =>
                    visit(
                      child,
                      nodeDepth + 1,
                      Program.policyNodeLocationChild(
                        location,
                        condition._tag,
                        index,
                      ),
                    ),
                  { discard: true },
                )
                return
              case "Not":
                return yield* visit(
                  condition.condition,
                  nodeDepth + 1,
                  Program.policyNodeLocationNot(location),
                )
              case "FactPredicate":
                facts.add(condition.fact)
                return
              case "CollectionPredicate":
                facts.add(condition.fact)
                return yield* visitItem(
                  condition.item,
                  nodeDepth + 1,
                  local,
                  location,
                )
              case "AiPrompt":
                aiNodes++
                if (aiNodes > MAX_AI_NODES)
                  return yield* new PolicyCompileError({
                    reason: "LimitExceeded",
                    message:
                      "A policy reference closure may contain at most one AI node.",
                    location,
                  })
                condition.evidence.forEach((fact) => facts.add(fact))
                return
              case "PolicyReference": {
                if (stack.has(condition.policyVersionId))
                  return yield* new PolicyCompileError({
                    reason: "ReferenceCycle",
                    message: `Policy reference cycle includes '${condition.policyVersionId}'.`,
                    location,
                  })
                if (
                  referenceDepth >= MAX_REFERENCE_DEPTH ||
                  (!references.has(condition.policyVersionId) &&
                    references.size >= MAX_REFERENCES)
                )
                  return yield* new PolicyCompileError({
                    reason: "LimitExceeded",
                    message: "Policy references exceed 8 versions or depth 4.",
                    location,
                  })
                references.add(condition.policyVersionId)
                const resolved = yield* resolver
                  .resolve(condition.policyVersionId)
                  .pipe(
                    Effect.mapError(
                      () =>
                        new PolicyCompileError({
                          reason: "MissingReference",
                          message: `Policy version '${condition.policyVersionId}' is unavailable.`,
                          location,
                        }),
                    ),
                  )
                if (resolved === null)
                  return yield* new PolicyCompileError({
                    reason: "MissingReference",
                    message: `Policy version '${condition.policyVersionId}' does not exist.`,
                    location,
                  })
                if (resolved.repositoryId !== context.repositoryId)
                  return yield* new PolicyCompileError({
                    reason: "ReferenceOwnership",
                    message: `Policy version '${condition.policyVersionId}' belongs to another repository.`,
                    location,
                  })
                if (
                  resolved.target !== program.target ||
                  resolved.program.target !== program.target
                )
                  return yield* new PolicyCompileError({
                    reason: "ReferenceTargetMismatch",
                    message: `Policy version '${condition.policyVersionId}' has an incompatible target.`,
                    location,
                  })
                const next = new Set(stack)
                next.add(condition.policyVersionId)
                yield* visitProgram(
                  resolved.program,
                  condition.policyVersionId,
                  nodeDepth + 1,
                  referenceDepth + 1,
                  next,
                  false,
                  Program.policyNodeLocationReference(
                    location,
                    condition.policyVersionId,
                    "appliesWhen",
                  ),
                  Program.policyNodeLocationReference(
                    location,
                    condition.policyVersionId,
                    "matchesWhen",
                  ),
                )
                return
              }
            }
          })
        if (current.appliesWhen !== null)
          yield* visit(current.appliesWhen, depth, appliesLocation)
        yield* visit(current.matchesWhen, depth, matchesLocation)
      })

    yield* visitProgram(
      program,
      context.policyId ?? "draft",
      1,
      0,
      new Set(),
      true,
      Program.policyNodeLocationRoot("appliesWhen"),
      Program.policyNodeLocationRoot("matchesWhen"),
    )
    const triggers = [
      ...new Set([
        ...RECONCILIATION_TRIGGERS,
        ...[...facts].flatMap((fact) => FACT_TRIGGERS[fact]),
      ]),
    ].sort()
    return {
      program,
      facts: [...facts].sort(),
      triggers,
      references: [...references].sort((left, right) =>
        left.localeCompare(right),
      ),
      nodeCount: localNodes,
      expandedNodeCount: expandedNodes,
      requiresChangedFileContent,
      aiNodeCount: aiNodes,
    } satisfies CompiledPolicyProgram
  },
)

import * as PolicyProgram from "@slopcop/domain/Policy/PolicyProgram"
import * as PolicyProgramSource from "@slopcop/domain/Policy/PolicyProgramSource"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import type { PolicyReference } from "./model"

const ExecutablePolicyProgram = Schema.Struct({
  target: Schema.Literal("pull_request"),
  appliesWhen: PolicyProgramSource.PolicyAppliesWhenSource,
  matchesWhen: PolicyProgramSource.ConditionSource,
})

export type ValidationResult =
  | {
      readonly _tag: "Valid"
      readonly program: PolicyProgram.PolicyProgram
    }
  | { readonly _tag: "InvalidJson"; readonly message: string }
  | { readonly _tag: "InvalidPolicy"; readonly message: string }

export const validateSource = (
  source: string,
  references: ReadonlyArray<PolicyReference> = [],
): ValidationResult => {
  let input: unknown
  try {
    input = JSON.parse(source)
  } catch (error) {
    return {
      _tag: "InvalidJson",
      message: error instanceof Error ? error.message : "Invalid JSON.",
    }
  }
  const decoded = Schema.decodeUnknownResult(ExecutablePolicyProgram)(input, {
    onExcessProperty: "error",
  })
  return Result.match(decoded, {
    onFailure: (failure) => ({
      _tag: "InvalidPolicy" as const,
      message: failure.issue.toString(),
    }),
    onSuccess: (source) => {
      for (const name of PolicyProgramSource.referencedPolicyNames(source)) {
        if (
          references.filter((reference) => reference.name === name).length > 1
        )
          return {
            _tag: "InvalidPolicy" as const,
            message: `More than one published policy is named '${name}'. Rename one before including it.`,
          }
      }
      return {
        _tag: "Valid" as const,
        program: PolicyProgramSource.toPolicyProgram(source, (name) => {
          const reference = references.find(
            (reference) =>
              reference.name === name || reference.policyVersionId === name,
          )
          return (
            reference?.policyVersionId ??
            Schema.decodeUnknownSync(PolicyProgram.PolicyVersionId)(name)
          )
        }),
      }
    },
  })
}

export const formatProgram = (
  program: PolicyProgram.PolicyProgram,
  references: ReadonlyArray<PolicyReference> = [],
): string => {
  const source = PolicyProgramSource.fromPolicyProgram(program, (id) => {
    const reference = references.find(
      (reference) => reference.policyVersionId === id,
    )
    return reference?.name ?? id
  })
  return JSON.stringify(
    source.appliesWhen === null
      ? { target: source.target, matchesWhen: source.matchesWhen }
      : source,
    null,
    2,
  )
}

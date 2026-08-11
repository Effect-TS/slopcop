import * as PolicyProgram from "@slopcop/domain/Policy/PolicyProgram"
import * as PolicyProgramSource from "@slopcop/domain/Policy/PolicyProgramSource"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"

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

export const validateSource = (source: string): ValidationResult => {
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
    onSuccess: (source) => ({
      _tag: "Valid" as const,
      program: PolicyProgramSource.toPolicyProgram(source),
    }),
  })
}

export const formatProgram = (program: PolicyProgram.PolicyProgram): string =>
  JSON.stringify(
    program.appliesWhen === null
      ? {
          target: program.target,
          matchesWhen:
            PolicyProgramSource.fromPolicyProgram(program).matchesWhen,
        }
      : PolicyProgramSource.fromPolicyProgram(program),
    null,
    2,
  )

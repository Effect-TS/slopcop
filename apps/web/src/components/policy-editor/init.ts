import type * as PolicyProgram from "@slopcop/domain/Policy/PolicyProgram"
import type { Model, PolicyReference } from "./model"
import { formatProgram } from "./validation"

export const init = (input: {
  readonly id: string
  readonly program: PolicyProgram.PolicyProgram
  readonly references: ReadonlyArray<PolicyReference>
}): Model => ({
  id: input.id,
  source: formatProgram(input.program, input.references),
  program: input.program,
  error: null,
  mountStatus: "Mounting",
  references: input.references,
})

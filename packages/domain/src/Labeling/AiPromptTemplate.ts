import * as PolicyProgram from "../Policy/PolicyProgram.ts"

const tokenPattern = /\{\{fact:([a-z0-9_.]+)\}\}/g
const maximumRenderedLength = 40_000

export type Validation =
  | Readonly<{
      _tag: "Valid"
      references: ReadonlyArray<PolicyProgram.PullRequestFact>
    }>
  | Readonly<{ _tag: "Invalid"; message: string }>

const isPullRequestFact = (
  value: string,
): value is PolicyProgram.PullRequestFact =>
  PolicyProgram.PullRequestScalarFact.literals.some((fact) => fact === value) ||
  PolicyProgram.PullRequestCollectionFact.literals.some(
    (fact) => fact === value,
  )

export const validate = (
  source: string,
  availableFacts?: ReadonlyArray<PolicyProgram.PullRequestFact>,
): Validation => {
  const references = new Set<PolicyProgram.PullRequestFact>()
  for (const match of source.matchAll(tokenPattern)) {
    const name = match[1]
    if (name === undefined || !isPullRequestFact(name))
      return {
        _tag: "Invalid",
        message: `Unknown pull request fact '${name ?? ""}'.`,
      }
    references.add(name)
  }
  if (source.replace(tokenPattern, "").includes("{{fact:"))
    return {
      _tag: "Invalid",
      message:
        "Fact interpolation must use the form {{fact:pull_request.title}}.",
    }
  if (availableFacts !== undefined) {
    const unavailable = [...references].find(
      (reference) => !availableFacts.includes(reference),
    )
    if (unavailable !== undefined)
      return {
        _tag: "Invalid",
        message: `Select '${unavailable}' under Information available to AI before using it in the prompt.`,
      }
  }
  return { _tag: "Valid", references: [...references] }
}

export const render = (
  source: string,
  evidence: Readonly<Record<string, unknown>>,
):
  | Readonly<{ _tag: "Rendered"; prompt: string }>
  | Readonly<{ _tag: "Invalid"; message: string }> => {
  const validation = validate(source)
  if (validation._tag === "Invalid") return validation
  for (const reference of validation.references)
    if (!Object.hasOwn(evidence, reference))
      return {
        _tag: "Invalid",
        message: `Evidence for '${reference}' is unavailable.`,
      }
  const prompt = source.replace(
    tokenPattern,
    (_token: string, name: string) => {
      const encoded = JSON.stringify(evidence[name])
      return encoded === undefined ? "null" : encoded
    },
  )
  return prompt.length <= maximumRenderedLength
    ? { _tag: "Rendered", prompt }
    : {
        _tag: "Invalid",
        message: `The rendered AI prompt exceeds ${maximumRenderedLength} characters. Select less information or shorten the prompt.`,
      }
}

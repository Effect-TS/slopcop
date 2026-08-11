import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete"
import type * as PolicyProgram from "@slopcop/domain/Policy/PolicyProgram"

type CompletionApply = Exclude<Completion["apply"], string | undefined>

const replaceToken =
  (fact: PolicyProgram.PullRequestFact): CompletionApply =>
  (view, _completion, from, to) => {
    const insert = `{{fact:${fact}}}`
    const replaceTo =
      view.state.doc.sliceString(to, to + 2) === "}}" ? to + 2 : to
    view.dispatch({
      changes: { from, to: replaceTo, insert },
      selection: { anchor: from + insert.length },
    })
  }

export const promptCompletionSource =
  (availableFacts: () => ReadonlyArray<PolicyProgram.PullRequestFact>) =>
  (context: CompletionContext): CompletionResult | null => {
    const token = context.matchBefore(/\{\{(?:fact:[a-z0-9_.]*)?/)
    if (token === null && !context.explicit) return null
    return {
      from: token?.from ?? context.pos,
      options: availableFacts().map((fact) => ({
        label: `{{fact:${fact}}}`,
        apply: replaceToken(fact),
        detail: "Selected pull request information",
        type: "variable",
      })),
    }
  }

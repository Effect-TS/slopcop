import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import {
  forceLinting,
  linter,
  lintKeymap,
  type Diagnostic,
} from "@codemirror/lint"
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search"
import {
  Compartment,
  EditorState,
  StateEffect,
  type Extension,
} from "@codemirror/state"
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  rectangularSelection,
  ViewPlugin,
} from "@codemirror/view"
import * as AiPromptTemplate from "@slopcop/domain/Labeling/AiPromptTemplate"
import * as PolicyProgram from "@slopcop/domain/Policy/PolicyProgram"
import { githubDark, githubLight } from "@uiw/codemirror-theme-github"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { promptCompletionSource } from "./completion"

const editorTheme = EditorView.theme({
  "&": { minHeight: "10rem", maxHeight: "24rem", fontSize: "13px" },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  ".cm-content": { padding: "12px 0" },
  "&.cm-focused": { outline: "none" },
})

const currentGitHubTheme = (): Extension =>
  document.documentElement.classList.contains("dark") ? githubDark : githubLight

const synchronizeGitHubTheme = (theme: Compartment) =>
  ViewPlugin.fromClass(
    class {
      readonly observer: MutationObserver

      constructor(view: EditorView) {
        this.observer = new MutationObserver(() => {
          view.dispatch({ effects: theme.reconfigure(currentGitHubTheme()) })
        })
        this.observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["class"],
        })
      }

      destroy() {
        this.observer.disconnect()
      }
    },
  )

const availableFacts = (
  element: HTMLElement,
): ReadonlyArray<PolicyProgram.PullRequestFact> => {
  const encoded = element.getAttribute("data-available-facts")
  if (encoded === null) return []
  try {
    const input: unknown = JSON.parse(encoded)
    const decoded = Schema.decodeUnknownOption(
      Schema.Array(PolicyProgram.PullRequestFact),
    )(input)
    return Option.getOrElse(decoded, () => [])
  } catch {
    return []
  }
}

const availableFactsChanged = StateEffect.define<void>()

const promptLinter = (element: HTMLElement) =>
  linter(
    (view): ReadonlyArray<Diagnostic> => {
      const validation = AiPromptTemplate.validate(
        view.state.doc.toString(),
        availableFacts(element),
      )
      return validation._tag === "Invalid"
        ? [
            {
              from: 0,
              to: view.state.doc.length,
              severity: "error",
              source: "SlopCop AI prompt",
              message: validation.message,
            },
          ]
        : []
    },
    {
      needsRefresh: (update) =>
        update.transactions.some((transaction) =>
          transaction.effects.some((effect) =>
            effect.is(availableFactsChanged),
          ),
        ),
    },
  )

const synchronizeAvailableFacts = (element: HTMLElement) =>
  ViewPlugin.fromClass(
    class {
      readonly observer: MutationObserver

      constructor(view: EditorView) {
        this.observer = new MutationObserver(() => {
          view.dispatch({ effects: availableFactsChanged.of(undefined) })
          forceLinting(view)
        })
        this.observer.observe(element, {
          attributes: true,
          attributeFilter: ["data-available-facts"],
        })
      }

      destroy() {
        this.observer.disconnect()
      }
    },
  )

export const createAiPromptEditor = (input: {
  readonly element: HTMLElement
  readonly initialSource: string
  readonly onChange: (source: string) => void
}): EditorView => {
  const theme = new Compartment()
  return new EditorView({
    doc: input.initialSource,
    parent: input.element,
    extensions: [
      theme.of(currentGitHubTheme()),
      synchronizeGitHubTheme(theme),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      closeBrackets(),
      rectangularSelection(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      promptLinter(input.element),
      synchronizeAvailableFacts(input.element),
      autocompletion({
        override: [promptCompletionSource(() => availableFacts(input.element))],
        activateOnTyping: true,
        selectOnOpen: true,
      }),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...completionKeymap,
        ...lintKeymap,
      ]),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        "aria-label": "AI prompt",
        "aria-describedby": `${input.element.id}-description`,
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) input.onChange(update.state.doc.toString())
      }),
      editorTheme,
    ],
  })
}

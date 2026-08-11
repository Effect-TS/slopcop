import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { json, jsonParseLinter } from "@codemirror/lang-json"
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
} from "@codemirror/language"
import {
  lintGutter,
  linter,
  lintKeymap,
  type Diagnostic,
} from "@codemirror/lint"
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search"
import { Compartment, EditorState, type Extension } from "@codemirror/state"
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
  ViewPlugin,
} from "@codemirror/view"
import { githubDark, githubLight } from "@uiw/codemirror-theme-github"
import { policyCompletionSource } from "./completion"
import type { PolicyReference } from "./model"
import { validateSource } from "./validation"

const policyLinter = (references: ReadonlyArray<PolicyReference>) =>
  linter((view): ReadonlyArray<Diagnostic> => {
    const validation = validateSource(view.state.doc.toString(), references)
    return validation._tag === "InvalidPolicy"
      ? [
          {
            from: 0,
            to: view.state.doc.length,
            severity: "error",
            source: "SlopCop policy",
            message: validation.message,
          },
        ]
      : []
  })

const editorTheme = EditorView.theme({
  "&": {
    minHeight: "26rem",
    maxHeight: "42rem",
    fontSize: "13px",
  },
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

export const createPolicyEditor = (input: {
  readonly element: HTMLElement
  readonly initialSource: string
  readonly references: ReadonlyArray<PolicyReference>
  readonly onChange: (source: string) => void
}): EditorView => {
  const theme = new Compartment()
  return new EditorView({
    doc: input.initialSource,
    parent: input.element,
    extensions: [
      theme.of(currentGitHubTheme()),
      synchronizeGitHubTheme(theme),
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      json(),
      linter(jsonParseLinter()),
      policyLinter(input.references),
      lintGutter(),
      autocompletion({
        override: [policyCompletionSource(input.references)],
        activateOnTyping: true,
        selectOnOpen: true,
      }),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap,
      ]),
      EditorView.contentAttributes.of({ "aria-label": "Policy program JSON" }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) input.onChange(update.state.doc.toString())
      }),
      editorTheme,
    ],
  })
}

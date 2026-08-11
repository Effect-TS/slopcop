import {
  CompletionContext,
  acceptCompletion,
  completionStatus,
  currentCompletions,
  startCompletion,
} from "@codemirror/autocomplete"
import { EditorState } from "@codemirror/state"
import { diagnosticCount } from "@codemirror/lint"
import { describe, expect, it, vi } from "vite-plus/test"
import {
  createAiPromptEditor,
  promptCompletionSource,
} from "../../src/components/ai-prompt-editor/index.ts"

describe("AI prompt editor", () => {
  it("offers only currently selected facts", () => {
    let facts: ReadonlyArray<"pull_request.title" | "pull_request.body"> = [
      "pull_request.title",
    ]
    const state = EditorState.create({ doc: "Use {{" })
    const context = new CompletionContext(state, state.doc.length, false)

    const first = promptCompletionSource(() => facts)(context)
    expect(first?.options.map((option) => option.label)).toEqual([
      "{{fact:pull_request.title}}",
    ])

    facts = ["pull_request.title", "pull_request.body"]
    const second = promptCompletionSource(() => facts)(context)
    expect(second?.options.map((option) => option.label)).toEqual([
      "{{fact:pull_request.title}}",
      "{{fact:pull_request.body}}",
    ])
  })

  it("inserts a fact token without duplicating auto-closed braces", async () => {
    const element = document.createElement("div")
    element.setAttribute(
      "data-available-facts",
      JSON.stringify(["pull_request.title"]),
    )
    document.body.append(element)
    const editor = createAiPromptEditor({
      element,
      initialSource: "{{}}",
      onChange: () => undefined,
    })

    expect(element.querySelector('[aria-label="AI prompt"]')).not.toBeNull()
    editor.dispatch({ selection: { anchor: 2 } })
    editor.focus()
    expect(startCompletion(editor)).toBe(true)
    await vi.waitFor(() => {
      expect(completionStatus(editor.state)).toBe("active")
    })
    expect(
      currentCompletions(editor.state).map((option) => option.label),
    ).toEqual(["{{fact:pull_request.title}}"])
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(acceptCompletion(editor)).toBe(true)
    expect(editor.state.doc.toString()).toBe("{{fact:pull_request.title}}")

    editor.destroy()
    expect(element.querySelector(".cm-editor")).toBeNull()
    element.remove()
  })

  it("clears diagnostics when an interpolated fact becomes available", async () => {
    const element = document.createElement("div")
    element.setAttribute(
      "data-available-facts",
      JSON.stringify(["pull_request.title"]),
    )
    document.body.append(element)
    const editor = createAiPromptEditor({
      element,
      initialSource: "{{fact:pull_request.body}}",
      onChange: () => undefined,
    })

    await vi.waitFor(() => {
      expect(diagnosticCount(editor.state)).toBe(1)
    })
    element.setAttribute(
      "data-available-facts",
      JSON.stringify(["pull_request.title", "pull_request.body"]),
    )
    await vi.waitFor(() => {
      expect(diagnosticCount(editor.state)).toBe(0)
    })

    editor.destroy()
    element.remove()
  })
})

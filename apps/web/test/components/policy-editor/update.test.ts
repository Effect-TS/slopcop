import {
  CompletionContext,
  acceptCompletion,
  completionStatus,
  currentCompletions,
  setSelectedCompletion,
  startCompletion,
} from "@codemirror/autocomplete"
import { json } from "@codemirror/lang-json"
import { EditorState } from "@codemirror/state"
import * as PolicyProgram from "@slopcop/domain/Policy/PolicyProgram"
import * as Schema from "effect/Schema"
import { describe, expect, it, vi } from "vite-plus/test"
import { policyCompletionSource } from "../../../src/components/policy-editor/completion.ts"
import { createPolicyEditor } from "../../../src/components/policy-editor/editor.ts"
import * as PolicyEditor from "../../../src/components/policy-editor/index.ts"

const defaultProgram = Schema.decodeUnknownSync(PolicyProgram.PolicyProgram)({
  target: "pull_request",
  appliesWhen: null,
  matchesWhen: {
    _tag: "FactPredicate",
    fact: "pull_request.draft",
    operator: "Equals",
    value: false,
  },
})

describe("policy editor", () => {
  it("mounts, follows the document theme, and destroys CodeMirror", async () => {
    const startedDark = document.documentElement.classList.contains("dark")
    document.documentElement.classList.remove("dark")
    const element = document.createElement("div")
    document.body.append(element)
    const editor = createPolicyEditor({
      element,
      initialSource: JSON.stringify(defaultProgram),
      references: [],
      onChange: () => undefined,
    })

    expect(element.querySelector(".cm-editor")).not.toBeNull()
    const lightThemeClasses = editor.dom.className
    document.documentElement.classList.add("dark")
    await vi.waitFor(() => {
      expect(editor.dom.className).not.toBe(lightThemeClasses)
    })
    editor.destroy()
    expect(element.querySelector(".cm-editor")).toBeNull()
    element.remove()
    document.documentElement.classList.toggle("dark", startedDark)
  })

  it("retains invalid source while clearing the executable program", () => {
    const model = PolicyEditor.init({
      id: "policy-editor-test",
      program: defaultProgram,
      references: [],
    })
    const [invalid] = PolicyEditor.update(
      model,
      PolicyEditor.EditedSource({ source: "{" }),
    )

    expect(invalid.source).toBe("{")
    expect(invalid.program).toBeNull()
    expect(invalid.error).toContain("JSON")
  })

  it("decodes valid source back into the policy program", () => {
    const model = PolicyEditor.init({
      id: "policy-editor-test",
      program: defaultProgram,
      references: [],
    })
    const source = JSON.stringify({
      target: "pull_request",
      matchesWhen: {
        fact: "pull_request.title",
        operator: "Contains",
        value: "documentation",
      },
    })
    const [valid] = PolicyEditor.update(
      model,
      PolicyEditor.EditedSource({ source }),
    )

    expect(valid.program?.matchesWhen).toMatchObject({
      fact: "pull_request.title",
      operator: "Contains",
      value: "documentation",
    })
    expect(valid.error).toBeNull()
  })

  it("rejects structurally invalid and unsupported issue policies", () => {
    const missingCondition = PolicyEditor.validateSource(
      JSON.stringify({ target: "pull_request", appliesWhen: null }),
    )
    const issue = PolicyEditor.validateSource(
      JSON.stringify({ ...defaultProgram, target: "issue" }),
    )

    expect(missingCondition._tag).toBe("InvalidPolicy")
    expect(issue._tag).toBe("InvalidPolicy")
  })

  it("rejects AI nodes in deterministic policies", () => {
    const validation = PolicyEditor.validateSource(
      JSON.stringify({
        target: "pull_request",
        matchesWhen: {
          aiPrompt: "Classify this pull request.",
          evidence: ["pull_request.title"],
          minimumConfidence: 0.8,
          evaluator: "boolean-policy-v1",
        },
      }),
    )

    expect(validation._tag).toBe("InvalidPolicy")
  })

  it("allows appliesWhen to be omitted from authored JSON", () => {
    const source = JSON.stringify({
      target: defaultProgram.target,
      matchesWhen: {
        fact: "pull_request.draft",
        operator: "Equals",
        value: false,
      },
    })
    const validation = PolicyEditor.validateSource(source)

    expect(validation._tag).toBe("Valid")
    if (validation._tag === "Valid")
      expect(validation.program.appliesWhen).toBeNull()
    expect(PolicyEditor.formatProgram(defaultProgram)).not.toContain(
      "appliesWhen",
    )
  })

  it("formats canonical programs using semantic syntax", () => {
    const source = PolicyEditor.formatProgram(
      Schema.decodeUnknownSync(PolicyProgram.PolicyProgram)({
        target: "pull_request",
        matchesWhen: {
          _tag: "All",
          conditions: [
            {
              _tag: "Not",
              condition: {
                _tag: "FactPredicate",
                fact: "pull_request.draft",
                operator: "Equals",
                value: true,
              },
            },
          ],
        },
      }),
    )

    expect(JSON.parse(source)).toEqual({
      target: "pull_request",
      matchesWhen: {
        allOf: [
          {
            not: {
              fact: "pull_request.draft",
              operator: "Equals",
              value: true,
            },
          },
        ],
      },
    })
    expect(source).not.toContain('"_tag"')
  })

  it("rejects canonical tagged syntax in the authoring editor", () => {
    const validation = PolicyEditor.validateSource(
      JSON.stringify(defaultProgram),
    )

    expect(validation._tag).toBe("InvalidPolicy")
  })

  it("rejects ambiguous semantic nodes", () => {
    const validation = PolicyEditor.validateSource(
      JSON.stringify({
        target: "pull_request",
        matchesWhen: {
          allOf: [
            {
              fact: "pull_request.draft",
              operator: "Equals",
              value: false,
            },
          ],
          fact: "pull_request.title",
          operator: "Contains",
          value: "docs",
        },
      }),
    )

    expect(validation._tag).toBe("InvalidPolicy")
  })

  it("offers operators that match the selected fact", async () => {
    const source = `{
  "target": "pull_request",
  "appliesWhen": null,
  "matchesWhen": {
    "fact": "pull_request.draft",
    "operator": ""
  }
}`
    const position = source.indexOf('""') + 1
    const state = EditorState.create({ doc: source, extensions: [json()] })
    const result = await policyCompletionSource([])(
      new CompletionContext(state, position, true),
    )

    expect(result?.options.map((option) => option.label)).toEqual([
      "Equals",
      "NotEquals",
    ])
  })

  it("opens the mounted completion UI", async () => {
    const source = `{
  "target": ""
}`
    const position = source.indexOf('""') + 1
    const direct = await policyCompletionSource([])(
      new CompletionContext(
        EditorState.create({ doc: source, extensions: [json()] }),
        position,
        true,
      ),
    )
    expect(direct?.options.map((option) => option.label)).toEqual([
      "pull_request",
    ])
    const element = document.createElement("div")
    document.body.append(element)
    const editor = createPolicyEditor({
      element,
      initialSource: source,
      references: [],
      onChange: () => undefined,
    })
    editor.dispatch({ selection: { anchor: position } })
    editor.focus()

    expect(startCompletion(editor)).toBe(true)
    await vi.waitFor(() => {
      expect(completionStatus(editor.state)).toBe("active")
    })
    expect(
      currentCompletions(editor.state).map((option) => option.label),
    ).toEqual(["pull_request"])
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(acceptCompletion(editor)).toBe(true)
    expect(JSON.parse(editor.state.doc.toString())).toEqual({
      target: "pull_request",
    })
    expect(editor.state.selection.main.head).toBe(
      editor.state.doc.toString().indexOf('"pull_request"') +
        '"pull_request"'.length,
    )

    editor.destroy()
    element.remove()
  })

  it("places the cursor after an autocompleted property name", async () => {
    const source = `{
  "target": "pull_request",
  "matchesWhen": {
    ""
  }
}`
    const position = source.lastIndexOf('""') + 1
    const element = document.createElement("div")
    document.body.append(element)
    const editor = createPolicyEditor({
      element,
      initialSource: source,
      references: [],
      onChange: () => undefined,
    })
    editor.dispatch({ selection: { anchor: position } })
    editor.focus()

    expect(startCompletion(editor)).toBe(true)
    await vi.waitFor(() => {
      expect(completionStatus(editor.state)).toBe("active")
    })
    const allOfIndex = currentCompletions(editor.state).findIndex(
      (option) => option.label === "allOf",
    )
    expect(allOfIndex).toBeGreaterThanOrEqual(0)
    editor.dispatch({ effects: setSelectedCompletion(allOfIndex) })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(acceptCompletion(editor)).toBe(true)
    const completedSource = editor.state.doc.toString()
    expect(completedSource).toContain('"allOf": ')
    expect(editor.state.selection.main.head).toBe(
      completedSource.indexOf('"allOf": ') + '"allOf": '.length,
    )

    editor.destroy()
    element.remove()
  })

  it("offers repository policy references by name", async () => {
    const source = `{
  "policy": ""
}`
    const position = source.lastIndexOf('""') + 1
    const state = EditorState.create({ doc: source, extensions: [json()] })
    const result = await policyCompletionSource([
      {
        name: "Shared policy",
        policyId: Schema.decodeUnknownSync(PolicyProgram.PolicyId)("policy-1"),
      },
    ])(new CompletionContext(state, position, true))

    expect(result?.options).toContainEqual(
      expect.objectContaining({
        label: "Shared policy",
        detail: "policy-1",
      }),
    )
  })

  it("resolves policy names to stable policy identifiers", () => {
    const reference = {
      name: "Shared policy",
      policyId: Schema.decodeUnknownSync(PolicyProgram.PolicyId)("policy-1"),
    }
    const validation = PolicyEditor.validateSource(
      JSON.stringify({
        target: "pull_request",
        matchesWhen: { policy: "Shared policy" },
      }),
      [reference],
    )

    expect(validation).toMatchObject({
      _tag: "Valid",
      program: {
        matchesWhen: {
          _tag: "PolicyReference",
          policyId: "policy-1",
        },
      },
    })
    expect(
      PolicyEditor.formatProgram(
        Schema.decodeUnknownSync(PolicyProgram.PolicyProgram)({
          target: "pull_request",
          matchesWhen: {
            _tag: "PolicyReference",
            policyId: "policy-1",
          },
        }),
        [reference],
      ),
    ).toContain('"policy": "Shared policy"')
  })

  it("rejects ambiguous policy names", () => {
    const validation = PolicyEditor.validateSource(
      JSON.stringify({
        target: "pull_request",
        matchesWhen: { policy: "Shared policy" },
      }),
      ["policy-1", "policy-2"].map((policyId) => ({
        name: "Shared policy",
        policyId: Schema.decodeUnknownSync(PolicyProgram.PolicyId)(policyId),
      })),
    )

    expect(validation).toMatchObject({
      _tag: "InvalidPolicy",
      message:
        "More than one policy is named 'Shared policy'. Rename one before including it.",
    })
  })

  it("offers collection fields inside semantic item groups", async () => {
    const source = `{
  "target": "pull_request",
  "matchesWhen": {
    "fact": "pull_request.changed_files",
    "quantifier": "Any",
    "item": {
      "anyOf": [
        {
          "field": ""
        }
      ]
    }
  }
}`
    const position = source.lastIndexOf('""') + 1
    const result = await policyCompletionSource([])(
      new CompletionContext(
        EditorState.create({ doc: source, extensions: [json()] }),
        position,
        true,
      ),
    )

    expect(result?.options.map((option) => option.label)).toEqual([
      "path",
      "status",
      "content",
    ])
  })

  it("only offers properties inside an opened property-name string", async () => {
    const propertySource = `{
  "target": "pull_request",
  "matchesWhen": {
    ""
  }
}`
    const propertyPosition = propertySource.lastIndexOf('""') + 1
    const propertyResult = await policyCompletionSource([])(
      new CompletionContext(
        EditorState.create({ doc: propertySource, extensions: [json()] }),
        propertyPosition,
        true,
      ),
    )
    expect(propertyResult?.options.map((option) => option.label)).not.toContain(
      "id",
    )
    expect(propertyResult?.options.map((option) => option.label)).not.toContain(
      "_tag",
    )
    expect(propertyResult?.options.map((option) => option.label)).toContain(
      "fact",
    )
    expect(propertyResult?.options.map((option) => option.label)).not.toContain(
      "Fact predicate node",
    )
    expect(propertyResult?.options.map((option) => option.label)).not.toContain(
      "All condition group",
    )
  })

  it("offers full nodes at an unquoted empty-node position", async () => {
    const markedSource = `{
  "target": "pull_request",
  "matchesWhen": {
    |
  }
}`
    const snippetPosition = markedSource.indexOf("|")
    const snippetSource = markedSource.replace("|", "")
    const element = document.createElement("div")
    document.body.append(element)
    const editor = createPolicyEditor({
      element,
      initialSource: snippetSource,
      references: [],
      onChange: () => undefined,
    })
    editor.dispatch({ selection: { anchor: snippetPosition } })
    expect(startCompletion(editor)).toBe(true)
    await vi.waitFor(() =>
      expect(completionStatus(editor.state)).toBe("active"),
    )
    const snippetIndex = currentCompletions(editor.state).findIndex(
      (option) => option.label === "Fact predicate node",
    )
    expect(
      currentCompletions(editor.state).map((option) => option.label),
    ).toContain("Include policy")
    expect(
      currentCompletions(editor.state).map((option) => option.label),
    ).not.toContain("AI prompt node")
    expect(snippetIndex).toBeGreaterThanOrEqual(0)
    editor.dispatch({ effects: setSelectedCompletion(snippetIndex) })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(acceptCompletion(editor)).toBe(true)
    expect(editor.state.doc.toString()).toContain('"fact":')
    expect(editor.state.doc.toString()).not.toContain('"id"')
    expect(editor.state.doc.toString()).not.toContain('"_tag"')
    editor.destroy()
    element.remove()
  })
})

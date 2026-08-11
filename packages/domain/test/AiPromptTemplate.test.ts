import * as AiPromptTemplate from "@slopcop/domain/Labeling/AiPromptTemplate"
import { describe, expect, it } from "@effect/vitest"

describe("AiPromptTemplate", () => {
  it("finds selected fact references", () => {
    expect(
      AiPromptTemplate.validate(
        "Classify {{fact:pull_request.title}} using {{fact:pull_request.changed_files}}.",
        ["pull_request.title", "pull_request.changed_files"],
      ),
    ).toEqual({
      _tag: "Valid",
      references: ["pull_request.title", "pull_request.changed_files"],
    })
  })

  it("rejects unknown and unselected facts", () => {
    expect(
      AiPromptTemplate.validate("{{fact:pull_request.author}}"),
    ).toMatchObject({ _tag: "Invalid" })
    expect(
      AiPromptTemplate.validate("{{fact:pull_request.body}}", [
        "pull_request.title",
      ]),
    ).toEqual({
      _tag: "Invalid",
      message:
        "Select 'pull_request.body' under Information available to AI before using it in the prompt.",
    })
  })

  it("renders fact values as JSON", () => {
    expect(
      AiPromptTemplate.render(
        "Title: {{fact:pull_request.title}}; files: {{fact:pull_request.changed_files}}",
        {
          "pull_request.title": "Fix parser",
          "pull_request.changed_files": [{ filename: "src/parser.ts" }],
        },
      ),
    ).toEqual({
      _tag: "Rendered",
      prompt: 'Title: "Fix parser"; files: [{"filename":"src/parser.ts"}]',
    })
  })
})

import {
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionSource,
} from "@codemirror/autocomplete"
import { syntaxTree } from "@codemirror/language"
import type { EditorState } from "@codemirror/state"
import type { SyntaxNode } from "@lezer/common"
import type { PolicyReference } from "./model"

const scalarFacts = [
  "pull_request.draft",
  "pull_request.title",
  "pull_request.body",
  "pull_request.base_ref",
  "pull_request.head_sha",
  "pull_request.current_labels",
] as const
const collectionFacts = [
  "pull_request.changed_files",
  "pull_request.required_checks",
  "pull_request.latest_reviews",
] as const
const allFacts = [...scalarFacts, ...collectionFacts]
const stringOperators = [
  "Equals",
  "NotEquals",
  "Contains",
  "MatchesGlob",
  "In",
  "IsEmpty",
  "NotEmpty",
] as const

const stringValue = (
  state: EditorState,
  node: SyntaxNode | null,
): string | null => {
  if (node === null) return null
  try {
    const value: unknown = JSON.parse(state.sliceDoc(node.from, node.to))
    return typeof value === "string" ? value : null
  } catch {
    return null
  }
}

const propertyName = (
  state: EditorState,
  property: SyntaxNode,
): string | null => stringValue(state, property.getChild("PropertyName"))

const propertyValue = (
  state: EditorState,
  object: SyntaxNode,
  name: string,
): string | null => {
  for (
    let child = object.firstChild;
    child !== null;
    child = child.nextSibling
  ) {
    if (child.name !== "Property" || propertyName(state, child) !== name)
      continue
    for (let part = child.firstChild; part !== null; part = part.nextSibling) {
      if (part.name !== "PropertyName" && part.name !== ":")
        return stringValue(state, part)
    }
  }
  return null
}

const hasProperty = (
  state: EditorState,
  object: SyntaxNode,
  name: string,
): boolean => {
  for (let child = object.firstChild; child !== null; child = child.nextSibling)
    if (child.name === "Property" && propertyName(state, child) === name)
      return true
  return false
}

const nearest = (node: SyntaxNode, name: string): SyntaxNode | null => {
  for (
    let current: SyntaxNode | null = node;
    current !== null;
    current = current.parent
  )
    if (current.name === name) return current
  return null
}

type CompletionApply = Exclude<Completion["apply"], string | undefined>

const replaceJsonString =
  (value: string): CompletionApply =>
  (view, _completion, from, to) => {
    const node = syntaxTree(view.state).resolveInner(Math.max(0, from - 1), 1)
    const string = nearest(node, "String")
    const replaceFrom = string?.from ?? from
    const insert = JSON.stringify(value)
    view.dispatch({
      changes: {
        from: replaceFrom,
        to: string?.to ?? to,
        insert,
      },
      selection: { anchor: replaceFrom + insert.length },
    })
  }

const replacePropertyName =
  (name: string): CompletionApply =>
  (view, _completion, from, to) => {
    const node = syntaxTree(view.state).resolveInner(Math.max(0, from - 1), 1)
    const propertyNameNode = nearest(node, "PropertyName")
    const propertyNode = nearest(node, "Property")
    const string = nearest(node, "String")
    const replaceFrom = propertyNameNode?.from ?? string?.from ?? from
    const insert =
      propertyNameNode === null || propertyNode?.getChild(":") === null
        ? `${JSON.stringify(name)}: `
        : JSON.stringify(name)
    view.dispatch({
      changes: {
        from: replaceFrom,
        to: propertyNameNode?.to ?? string?.to ?? to,
        insert,
      },
      selection: { anchor: replaceFrom + insert.length },
    })
  }

const containingProperty = (node: SyntaxNode): SyntaxNode | null =>
  nearest(node, "Property")

const containingObject = (node: SyntaxNode): SyntaxNode | null =>
  nearest(node, "Object")

const propertyInObject = (
  node: SyntaxNode,
  object: SyntaxNode,
): SyntaxNode | null => {
  const property = containingProperty(node)
  const parent = property?.parent
  return parent?.name === "Object" &&
    parent.from === object.from &&
    parent.to === object.to
    ? property
    : null
}

const hasNamedProperty = (state: EditorState, object: SyntaxNode): boolean => {
  for (let child = object.firstChild; child !== null; child = child.nextSibling)
    if (child.name === "Property" && propertyName(state, child) !== null)
      return true
  return false
}

const ancestorPropertyName = (
  state: EditorState,
  node: SyntaxNode,
): string | null => {
  for (let current = node.parent; current !== null; current = current.parent)
    if (current.name === "Property") return propertyName(state, current)
  return null
}

const isItemObject = (state: EditorState, object: SyntaxNode): boolean => {
  for (
    let current = object.parent;
    current !== null;
    current = current.parent
  ) {
    if (current.name !== "Property") continue
    const name = propertyName(state, current)
    if (name === "item") return true
    if (name === "appliesWhen" || name === "matchesWhen") return false
  }
  return false
}

const enclosingCollectionFact = (
  state: EditorState,
  object: SyntaxNode,
): string | null => {
  for (
    let current: SyntaxNode | null = object;
    current !== null;
    current = current.parent
  ) {
    if (current.name !== "Object") continue
    if (hasProperty(state, current, "quantifier"))
      return propertyValue(state, current, "fact")
  }
  return null
}

const quoted = (values: ReadonlyArray<string>, type = "enum"): Completion[] =>
  values.map((value) => ({
    label: value,
    apply: replaceJsonString(value),
    type,
  }))

const property = (name: string, detail: string): Completion => ({
  label: name,
  apply: replacePropertyName(name),
  type: "property",
  detail,
})

const nodeSnippets = (item: boolean): Completion[] =>
  item
    ? [
        snippetCompletion(
          '"field": "${1:path}",\n"operator": "${2:MatchesGlob}",\n"value": "${3:**/*}"',
          {
            label: "Predicate node",
            type: "snippet",
            detail: "Insert a collection item predicate",
          },
        ),
        snippetCompletion('"allOf": [\n\t{\n\t\t${1}\n\t}\n]', {
          label: "All item group",
          type: "snippet",
        }),
        snippetCompletion('"anyOf": [\n\t{\n\t\t${1}\n\t}\n]', {
          label: "Any item group",
          type: "snippet",
        }),
        snippetCompletion('"not": {\n\t${1}\n}', {
          label: "Not item group",
          type: "snippet",
        }),
      ]
    : [
        snippetCompletion(
          '"fact": "${1:pull_request.title}",\n"operator": "${2:Contains}",\n"value": "${3}"',
          {
            label: "Fact predicate node",
            type: "snippet",
          },
        ),
        snippetCompletion(
          '"fact": "${1:pull_request.changed_files}",\n"quantifier": "${2:Any}",\n"item": {\n\t${3}\n}',
          {
            label: "Collection predicate node",
            type: "snippet",
          },
        ),
        snippetCompletion('"allOf": [\n\t{\n\t\t${1}\n\t}\n]', {
          label: "All condition group",
          type: "snippet",
        }),
        snippetCompletion('"anyOf": [\n\t{\n\t\t${1}\n\t}\n]', {
          label: "Any condition group",
          type: "snippet",
        }),
        snippetCompletion('"not": {\n\t${1}\n}', {
          label: "Not condition",
          type: "snippet",
        }),
        snippetCompletion('"policy": "${1}"', {
          label: "Include policy",
          type: "snippet",
          detail: "Reuse another policy",
        }),
      ]

const propertyCompletions = (
  state: EditorState,
  object: SyntaxNode,
): Completion[] => {
  const item = isItemObject(state, object)
  const root = ancestorPropertyName(state, object) === null && !item
  if (root)
    return [
      property("target", "Policy execution target"),
      property("appliesWhen", "Optional applicability condition"),
      property("matchesWhen", "Required matching condition"),
    ]
  if (hasProperty(state, object, "allOf")) return []
  if (hasProperty(state, object, "anyOf")) return []
  if (hasProperty(state, object, "not")) return []
  if (item) {
    if (!hasProperty(state, object, "field"))
      return [
        property("allOf", "All item predicates must match"),
        property("anyOf", "At least one item predicate must match"),
        property("not", "Negated item predicate"),
        property("field", "Collection item field"),
      ]
    return [
      property("field", "Collection item field"),
      property("operator", "Field comparison operator"),
      property("value", "Comparison value; omit for value-less operators"),
    ]
  }
  if (hasProperty(state, object, "policy"))
    return [property("policy", "Included policy")]
  if (hasProperty(state, object, "fact"))
    return collectionFacts.some(
      (fact) => fact === propertyValue(state, object, "fact"),
    )
      ? [
          property("fact", "Pull request collection"),
          property("quantifier", "Collection quantifier"),
          property("item", "Predicate applied to collection items"),
        ]
      : [
          property("fact", "Pull request fact"),
          property("operator", "Fact comparison operator"),
          property("value", "Comparison value; omit for value-less operators"),
        ]
  return [
    property("allOf", "All conditions must match"),
    property("anyOf", "At least one condition must match"),
    property("not", "Negated condition"),
    property("fact", "Pull request fact or collection"),
    property("policy", "Included policy"),
  ]
}

const valueCompletions = (
  state: EditorState,
  object: SyntaxNode,
  key: string,
  references: ReadonlyArray<PolicyReference>,
): Completion[] => {
  const item = isItemObject(state, object)
  const fact = propertyValue(state, object, "fact")
  const field = propertyValue(state, object, "field")
  switch (key) {
    case "target":
      return quoted(["pull_request"])
    case "fact":
      return quoted(item ? [] : [...allFacts])
    case "quantifier":
      return quoted(["Any", "All", "None"])
    case "field": {
      const collection = enclosingCollectionFact(state, object)
      return quoted(
        collection === "pull_request.changed_files"
          ? ["path", "status", "content"]
          : collection === "pull_request.required_checks"
            ? ["producer", "name", "state"]
            : ["reviewer", "state"],
      )
    }
    case "operator":
      if (fact === "pull_request.draft") return quoted(["Equals", "NotEquals"])
      if (fact === "pull_request.current_labels")
        return quoted(["Contains", "IsEmpty", "NotEmpty"])
      if (field === "status") return quoted(["Equals", "NotEquals", "In"])
      return quoted(
        field === "content"
          ? [...stringOperators, "ValidChangesetDocument"]
          : [...stringOperators],
      )
    case "value":
      if (fact === "pull_request.draft")
        return [
          { label: "false", apply: "false", type: "constant" },
          { label: "true", apply: "true", type: "constant" },
        ]
      if (propertyValue(state, object, "operator") === "In")
        return [
          snippetCompletion('[\n\t"${1:value}"\n]', {
            label: "String list",
            type: "snippet",
          }),
        ]
      return []
    case "policy":
      return references.map((reference) => ({
        label: reference.name,
        displayLabel: reference.name,
        apply: replaceJsonString(reference.name),
        detail: reference.policyId,
        type: "reference",
      }))
    default:
      return []
  }
}

export const policyCompletionSource =
  (references: ReadonlyArray<PolicyReference>): CompletionSource =>
  (context: CompletionContext) => {
    const node = syntaxTree(context.state).resolveInner(context.pos, -1)
    const object = containingObject(node)
    if (object === null) return null
    const currentProperty = propertyInObject(node, object)
    const propertyKey =
      currentProperty === null
        ? null
        : propertyName(context.state, currentProperty)
    const propertyNameNode = currentProperty?.getChild("PropertyName") ?? null
    const editingPropertyName =
      currentProperty !== null &&
      (propertyNameNode === null || context.pos <= propertyNameNode.to)
    const match = context.matchBefore(/"?[-\w.]*"?$/)
    if (match === null && !context.explicit) return null
    const matchFrom = match?.from ?? context.pos
    if (matchFrom === context.pos && !context.explicit) return null
    const matchedText = context.state.sliceDoc(matchFrom, context.pos)
    const nodePosition =
      currentProperty === null &&
      !matchedText.startsWith('"') &&
      !hasNamedProperty(context.state, object) &&
      ancestorPropertyName(context.state, object) !== null
    return {
      from: matchedText.startsWith('"') ? matchFrom + 1 : matchFrom,
      options: nodePosition
        ? nodeSnippets(isItemObject(context.state, object))
        : editingPropertyName || propertyKey === null
          ? propertyCompletions(context.state, object)
          : valueCompletions(context.state, object, propertyKey, references),
    }
  }

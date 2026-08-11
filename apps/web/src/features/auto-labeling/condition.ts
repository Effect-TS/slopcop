import * as PolicyProgram from "@slopcop/domain/Policy/PolicyProgram"
import * as Schema from "effect/Schema"

export const NodeKind = Schema.Literals([
  "All",
  "Any",
  "Not",
  "FactPredicate",
  "CollectionPredicate",
  "AiPrompt",
  "PolicyReference",
])
export type NodeKind = typeof NodeKind.Type
export const ItemKind = Schema.Literals(["All", "Any", "Not", "Predicate"])
export type ItemKind = typeof ItemKind.Type
export const Operator = Schema.Literals([
  "Equals",
  "NotEquals",
  "Contains",
  "MatchesGlob",
  "In",
  "IsEmpty",
  "NotEmpty",
  "ValidChangesetDocument",
])
export type Operator = typeof Operator.Type
export const Quantifier = Schema.Literals(["Any", "All", "None"])
export type Quantifier = typeof Quantifier.Type

export type DraftItem =
  | {
      readonly _tag: "All" | "Any"
      readonly clientId: string
      readonly predicates: ReadonlyArray<DraftItem>
    }
  | {
      readonly _tag: "Not"
      readonly clientId: string
      readonly predicate: DraftItem
    }
  | {
      readonly _tag: "Predicate"
      readonly clientId: string
      readonly field: string
      readonly operator: Operator
      readonly value: string
    }

export const DraftItem: Schema.Codec<DraftItem, unknown> = Schema.suspend(() =>
  Schema.Union([
    Schema.Struct({
      _tag: Schema.Literals(["All", "Any"]),
      clientId: Schema.String,
      predicates: Schema.Array(DraftItem),
    }),
    Schema.Struct({
      _tag: Schema.Literal("Not"),
      clientId: Schema.String,
      predicate: DraftItem,
    }),
    Schema.Struct({
      _tag: Schema.Literal("Predicate"),
      clientId: Schema.String,
      field: Schema.String,
      operator: Operator,
      value: Schema.String,
    }),
  ]),
)

export type DraftCondition =
  | {
      readonly _tag: "All" | "Any"
      readonly clientId: string
      readonly conditions: ReadonlyArray<DraftCondition>
    }
  | {
      readonly _tag: "Not"
      readonly clientId: string
      readonly condition: DraftCondition
    }
  | {
      readonly _tag: "FactPredicate"
      readonly clientId: string
      readonly fact: typeof PolicyProgram.PullRequestScalarFact.Type
      readonly operator: Operator
      readonly value: string
    }
  | {
      readonly _tag: "CollectionPredicate"
      readonly clientId: string
      readonly fact: typeof PolicyProgram.PullRequestCollectionFact.Type
      readonly quantifier: Quantifier
      readonly item: DraftItem
    }
  | {
      readonly _tag: "AiPrompt"
      readonly clientId: string
      readonly prompt: string
      readonly evidence: ReadonlyArray<PolicyProgram.PullRequestFact>
      readonly minimumConfidence: number
      readonly evaluator: "boolean-policy-v1"
    }
  | {
      readonly _tag: "PolicyReference"
      readonly clientId: string
      readonly policyVersionId: string
    }

export const DraftCondition: Schema.Codec<DraftCondition, unknown> =
  Schema.suspend(() =>
    Schema.Union([
      Schema.Struct({
        _tag: Schema.Literals(["All", "Any"]),
        clientId: Schema.String,
        conditions: Schema.Array(DraftCondition),
      }),
      Schema.Struct({
        _tag: Schema.Literal("Not"),
        clientId: Schema.String,
        condition: DraftCondition,
      }),
      Schema.Struct({
        _tag: Schema.Literal("FactPredicate"),
        clientId: Schema.String,
        fact: PolicyProgram.PullRequestScalarFact,
        operator: Operator,
        value: Schema.String,
      }),
      Schema.Struct({
        _tag: Schema.Literal("CollectionPredicate"),
        clientId: Schema.String,
        fact: PolicyProgram.PullRequestCollectionFact,
        quantifier: Quantifier,
        item: DraftItem,
      }),
      Schema.Struct({
        _tag: Schema.Literal("AiPrompt"),
        clientId: Schema.String,
        prompt: Schema.String,
        evidence: Schema.Array(PolicyProgram.PullRequestFact),
        minimumConfidence: Schema.Number,
        evaluator: Schema.Literal("boolean-policy-v1"),
      }),
      Schema.Struct({
        _tag: Schema.Literal("PolicyReference"),
        clientId: Schema.String,
        policyVersionId: Schema.String,
      }),
    ]),
  )

export const PolicyDraft = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  target: Schema.Literal("pull_request"),
  appliesWhen: Schema.NullOr(DraftCondition),
  matchesWhen: DraftCondition,
})
export type PolicyDraft = typeof PolicyDraft.Type

export const defaultItem = (clientId: string): DraftItem => ({
  _tag: "Predicate",
  clientId,
  field: "path",
  operator: "MatchesGlob",
  value: "**/*",
})
export const defaultItemForCollection = (
  clientId: string,
  fact: typeof PolicyProgram.PullRequestCollectionFact.Type,
): DraftItem => ({
  _tag: "Predicate",
  clientId,
  field:
    fact === "pull_request.required_checks"
      ? "producer"
      : fact === "pull_request.latest_reviews"
        ? "reviewer"
        : "path",
  operator: fact === "pull_request.changed_files" ? "MatchesGlob" : "Equals",
  value: fact === "pull_request.changed_files" ? "**/*" : "",
})

export const defaultCondition = (
  kind: NodeKind,
  clientId: string,
  childClientId: string,
  itemClientId: string,
): DraftCondition => {
  switch (kind) {
    case "All":
    case "Any":
      return {
        _tag: kind,
        clientId,
        conditions: [
          {
            _tag: "FactPredicate",
            clientId: childClientId,
            fact: "pull_request.draft",
            operator: "Equals",
            value: "false",
          },
        ],
      }
    case "Not":
      return {
        _tag: "Not",
        clientId,
        condition: {
          _tag: "FactPredicate",
          clientId: childClientId,
          fact: "pull_request.draft",
          operator: "Equals",
          value: "false",
        },
      }
    case "FactPredicate":
      return {
        _tag: "FactPredicate",
        clientId,
        fact: "pull_request.draft",
        operator: "Equals",
        value: "false",
      }
    case "CollectionPredicate":
      return {
        _tag: "CollectionPredicate",
        clientId,
        fact: "pull_request.changed_files",
        quantifier: "Any",
        item: defaultItem(itemClientId),
      }
    case "AiPrompt":
      return {
        _tag: "AiPrompt",
        clientId,
        prompt: "",
        evidence: ["pull_request.title"],
        minimumConfidence: 0.8,
        evaluator: "boolean-policy-v1",
      }
    case "PolicyReference":
      return { _tag: "PolicyReference", clientId, policyVersionId: "" }
  }
}

export const mapCondition = (
  condition: DraftCondition,
  clientId: string,
  transform: (condition: DraftCondition) => DraftCondition,
): DraftCondition => {
  if (condition.clientId === clientId) return transform(condition)
  switch (condition._tag) {
    case "All":
    case "Any":
      return {
        ...condition,
        conditions: condition.conditions.map((child) =>
          mapCondition(child, clientId, transform),
        ),
      }
    case "Not":
      return {
        ...condition,
        condition: mapCondition(condition.condition, clientId, transform),
      }
    default:
      return condition
  }
}

export const removeCondition = (
  condition: DraftCondition,
  clientId: string,
): DraftCondition => {
  switch (condition._tag) {
    case "All":
    case "Any": {
      const retained = condition.conditions.filter(
        (child) => child.clientId !== clientId,
      )
      return {
        ...condition,
        conditions: (retained.length === 0
          ? condition.conditions
          : retained
        ).map((child) => removeCondition(child, clientId)),
      }
    }
    case "Not":
      return {
        ...condition,
        condition: removeCondition(condition.condition, clientId),
      }
    default:
      return condition
  }
}

export const mapItem = (
  item: DraftItem,
  clientId: string,
  transform: (item: DraftItem) => DraftItem,
): DraftItem => {
  if (item.clientId === clientId) return transform(item)
  switch (item._tag) {
    case "All":
    case "Any":
      return {
        ...item,
        predicates: item.predicates.map((child) =>
          mapItem(child, clientId, transform),
        ),
      }
    case "Not":
      return {
        ...item,
        predicate: mapItem(item.predicate, clientId, transform),
      }
    case "Predicate":
      return item
  }
}

export const removeItem = (item: DraftItem, clientId: string): DraftItem => {
  switch (item._tag) {
    case "All":
    case "Any": {
      const retained = item.predicates.filter(
        (child) => child.clientId !== clientId,
      )
      return {
        ...item,
        predicates: (retained.length === 0 ? item.predicates : retained).map(
          (child) => removeItem(child, clientId),
        ),
      }
    }
    case "Not":
      return { ...item, predicate: removeItem(item.predicate, clientId) }
    case "Predicate":
      return item
  }
}

const stripItem = (item: DraftItem): unknown => {
  switch (item._tag) {
    case "All":
    case "Any":
      return {
        _tag: item._tag,
        predicates: item.predicates.map(stripItem),
      }
    case "Not":
      return { _tag: "Not", predicate: stripItem(item.predicate) }
    case "Predicate":
      return item.operator === "IsEmpty" ||
        item.operator === "NotEmpty" ||
        item.operator === "ValidChangesetDocument"
        ? { _tag: "Predicate", field: item.field, operator: item.operator }
        : {
            _tag: "Predicate",
            field: item.field,
            operator: item.operator,
            value:
              item.operator === "In"
                ? item.value
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean)
                : item.value,
          }
  }
}

const stripCondition = (condition: DraftCondition): unknown => {
  switch (condition._tag) {
    case "All":
    case "Any":
      return {
        _tag: condition._tag,
        conditions: condition.conditions.map(stripCondition),
      }
    case "Not":
      return {
        _tag: "Not",
        condition: stripCondition(condition.condition),
      }
    case "FactPredicate":
      return condition.operator === "IsEmpty" ||
        condition.operator === "NotEmpty"
        ? {
            _tag: "FactPredicate",
            fact: condition.fact,
            operator: condition.operator,
          }
        : {
            _tag: "FactPredicate",
            fact: condition.fact,
            operator: condition.operator,
            value:
              condition.fact === "pull_request.draft"
                ? condition.value === "true"
                : condition.operator === "In"
                  ? condition.value
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean)
                  : condition.value,
          }
    case "CollectionPredicate":
      return {
        _tag: "CollectionPredicate",
        fact: condition.fact,
        quantifier: condition.quantifier,
        item: stripItem(condition.item),
      }
    case "AiPrompt":
      return {
        _tag: "AiPrompt",
        prompt: condition.prompt,
        evidence: condition.evidence,
        minimumConfidence: condition.minimumConfidence,
        evaluator: condition.evaluator,
      }
    case "PolicyReference":
      return {
        _tag: "PolicyReference",
        policyVersionId: condition.policyVersionId,
      }
  }
}

export const toProgram = (draft: PolicyDraft) =>
  Schema.decodeUnknownResult(PolicyProgram.PolicyProgram)({
    target: draft.target,
    appliesWhen:
      draft.appliesWhen === null ? null : stripCondition(draft.appliesWhen),
    matchesWhen: stripCondition(draft.matchesWhen),
  })

const draftItemFrom = (
  item:
    | PolicyProgram.ChangedFileItemPredicate
    | PolicyProgram.CheckItemPredicate
    | PolicyProgram.ReviewItemPredicate,
  nextId: () => string,
): DraftItem => {
  switch (item._tag) {
    case "All":
    case "Any":
      return {
        _tag: item._tag,
        clientId: nextId(),
        predicates: item.predicates.map((child) =>
          draftItemFrom(child, nextId),
        ),
      }
    case "Not":
      return {
        _tag: "Not",
        clientId: nextId(),
        predicate: draftItemFrom(item.predicate, nextId),
      }
    case "Predicate":
      return {
        _tag: "Predicate",
        clientId: nextId(),
        field: item.field,
        operator: item.operator,
        value:
          "value" in item
            ? typeof item.value === "string"
              ? item.value
              : item.value.join(", ")
            : "",
      }
  }
}

export const draftConditionFrom = (
  condition: PolicyProgram.Condition,
  nextId: () => string,
): DraftCondition => {
  switch (condition._tag) {
    case "All":
    case "Any":
      return {
        _tag: condition._tag,
        clientId: nextId(),
        conditions: condition.conditions.map((child) =>
          draftConditionFrom(child, nextId),
        ),
      }
    case "Not":
      return {
        _tag: "Not",
        clientId: nextId(),
        condition: draftConditionFrom(condition.condition, nextId),
      }
    case "FactPredicate":
      return {
        _tag: "FactPredicate",
        clientId: nextId(),
        fact: condition.fact,
        operator: condition.operator,
        value:
          "value" in condition
            ? Array.isArray(condition.value)
              ? condition.value.join(", ")
              : String(condition.value)
            : "",
      }
    case "CollectionPredicate":
      return {
        _tag: "CollectionPredicate",
        clientId: nextId(),
        fact: condition.fact,
        quantifier: condition.quantifier,
        item: draftItemFrom(condition.item, nextId),
      }
    case "AiPrompt":
      return { ...condition, clientId: nextId() }
    case "PolicyReference":
      return { ...condition, clientId: nextId() }
  }
}

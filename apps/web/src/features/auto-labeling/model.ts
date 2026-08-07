import * as Schema from "effect/Schema"

export const RuleId = Schema.Literals(["Documentation", "Bug", "Dependencies"])
export type RuleId = typeof RuleId.Type

export const RuleMode = Schema.Literals(["add-only", "reconcile"])
export type RuleMode = typeof RuleMode.Type

export const RuleKind = Schema.Literals(["ai", "ready-for-review"])
export type RuleKind = typeof RuleKind.Type

export const RuleTestStage = Schema.Literals(["Closed", "Configure", "Result"])
export type RuleTestStage = typeof RuleTestStage.Type

export const Model = Schema.Struct({
  editingRule: Schema.NullOr(RuleId),
  testingRule: Schema.NullOr(RuleId),
  deletingRule: Schema.NullOr(RuleId),
  openRuleMenu: Schema.NullOr(RuleId),
  documentationEnabled: Schema.Boolean,
  bugEnabled: Schema.Boolean,
  dependenciesEnabled: Schema.Boolean,
  documentationLabel: Schema.String,
  bugLabel: Schema.String,
  dependenciesLabel: Schema.String,
  documentationConfidence: Schema.Number,
  bugConfidence: Schema.Number,
  dependenciesConfidence: Schema.Number,
  documentationMode: RuleMode,
  bugMode: RuleMode,
  dependenciesMode: RuleMode,
  documentationKind: RuleKind,
  bugKind: RuleKind,
  dependenciesKind: RuleKind,
  documentationExclusiveGroup: Schema.String,
  bugExclusiveGroup: Schema.String,
  dependenciesExclusiveGroup: Schema.String,
  ruleTestStage: RuleTestStage,
  documentationPrompt: Schema.String,
  bugPrompt: Schema.String,
  dependenciesPrompt: Schema.String,
})
export type Model = typeof Model.Type

import * as Schema from "effect/Schema"
import { m } from "foldkit/message"
import { RuleId, RuleKind, RuleMode } from "./model"

export const OpenedRuleEditor = m("OpenedRuleEditor", { ruleId: RuleId })
export type OpenedRuleEditor = typeof OpenedRuleEditor.Type

export const ToggledRuleMenu = m("ToggledRuleMenu", { ruleId: RuleId })
export type ToggledRuleMenu = typeof ToggledRuleMenu.Type

export const OpenedRuleTest = m("OpenedRuleTest", { ruleId: RuleId })
export type OpenedRuleTest = typeof OpenedRuleTest.Type

export const OpenedDeleteRule = m("OpenedDeleteRule", { ruleId: RuleId })
export type OpenedDeleteRule = typeof OpenedDeleteRule.Type

export const DismissedDeleteRule = m("DismissedDeleteRule")
export type DismissedDeleteRule = typeof DismissedDeleteRule.Type

export const ConfirmedDeleteRule = m("ConfirmedDeleteRule")
export type ConfirmedDeleteRule = typeof ConfirmedDeleteRule.Type

export const ClosedRuleEditor = m("ClosedRuleEditor")
export type ClosedRuleEditor = typeof ClosedRuleEditor.Type

export const ToggledRule = m("ToggledRule", { ruleId: RuleId })
export type ToggledRule = typeof ToggledRule.Type

export const UpdatedRuleLabel = m("UpdatedRuleLabel", {
  ruleId: RuleId,
  label: Schema.String,
})
export type UpdatedRuleLabel = typeof UpdatedRuleLabel.Type

export const UpdatedRuleConfidence = m("UpdatedRuleConfidence", {
  ruleId: RuleId,
  confidence: Schema.Number,
})
export type UpdatedRuleConfidence = typeof UpdatedRuleConfidence.Type

export const UpdatedRuleMode = m("UpdatedRuleMode", {
  ruleId: RuleId,
  mode: RuleMode,
})
export type UpdatedRuleMode = typeof UpdatedRuleMode.Type

export const UpdatedRuleKind = m("UpdatedRuleKind", {
  ruleId: RuleId,
  kind: RuleKind,
})
export type UpdatedRuleKind = typeof UpdatedRuleKind.Type

export const UpdatedRuleExclusiveGroup = m("UpdatedRuleExclusiveGroup", {
  ruleId: RuleId,
  exclusiveGroup: Schema.String,
})
export type UpdatedRuleExclusiveGroup = typeof UpdatedRuleExclusiveGroup.Type

export const DismissedRuleTest = m("DismissedRuleTest")
export type DismissedRuleTest = typeof DismissedRuleTest.Type

export const RanRuleTest = m("RanRuleTest")
export type RanRuleTest = typeof RanRuleTest.Type

export const ResetRuleTest = m("ResetRuleTest")
export type ResetRuleTest = typeof ResetRuleTest.Type

export const UpdatedRulePrompt = m("UpdatedRulePrompt", {
  ruleId: RuleId,
  prompt: Schema.String,
})
export type UpdatedRulePrompt = typeof UpdatedRulePrompt.Type

export const Message = Schema.Union([
  ClosedRuleEditor,
  ConfirmedDeleteRule,
  DismissedDeleteRule,
  DismissedRuleTest,
  OpenedDeleteRule,
  OpenedRuleEditor,
  OpenedRuleTest,
  RanRuleTest,
  ResetRuleTest,
  ToggledRule,
  ToggledRuleMenu,
  UpdatedRuleConfidence,
  UpdatedRuleExclusiveGroup,
  UpdatedRuleKind,
  UpdatedRuleLabel,
  UpdatedRuleMode,
  UpdatedRulePrompt,
])
export type Message = typeof Message.Type

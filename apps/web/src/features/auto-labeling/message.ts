import * as Dialog from "@foldkit/ui/dialog"
import * as Menu from "@foldkit/ui/menu"
import * as Slider from "@foldkit/ui/slider"
import * as GitHubLabel from "@slopcop/domain/GitHub/GitHubLabel"
import * as PolicyManagement from "@slopcop/domain/Labeling/LabelingPolicyManagement"
import * as RuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import * as PolicyProgram from "@slopcop/domain/Policy/PolicyProgram"
import * as Schema from "effect/Schema"
import { m } from "foldkit/message"
import * as AiPromptEditor from "../../components/ai-prompt-editor"
import * as PolicyCodeEditor from "../../components/policy-editor"
import { ItemKind, NodeKind, Operator, Quantifier } from "./condition"
import { Toast } from "./toast"
import {
  PolicyId,
  PolicyVersionId,
  Repository,
  RuleDraft,
  RuleId,
} from "./model"

export const SelectedRepositoryChanged = m("SelectedRepositoryChanged", {
  repository: Schema.NullOr(Repository),
})
export const RetriedRepositoryLoad = m("RetriedRepositoryLoad")
export const LoadedRepositoryData = m("LoadedRepositoryData", {
  requestId: Schema.Int,
  repository: Repository,
  policyRevision: Schema.Int,
  ruleRevision: Schema.Int,
  policies: Schema.Array(PolicyManagement.PublicPolicy),
  rules: Schema.Array(RuleManagement.PublicLabelingRule),
  activity: RuleManagement.LabelingRuleActivitySummary,
  audit: Schema.Array(RuleManagement.PublicLabelingRuleAuditEntry),
  labels: Schema.Array(GitHubLabel.GitHubLabel),
})
export const FailedToLoadRepositoryData = m("FailedToLoadRepositoryData", {
  requestId: Schema.Int,
  repository: Repository,
  message: Schema.String,
})
export const IgnoredInput = m("IgnoredInput")

export const OpenedNewPolicy = m("OpenedNewPolicy")
export const OpenedPolicyEditor = m("OpenedPolicyEditor", {
  policyId: PolicyId,
})
export const LoadedPolicyDetail = m("LoadedPolicyDetail", {
  requestId: Schema.Int,
  repository: Repository,
  detail: PolicyManagement.PublicPolicyDetail,
})
export const FailedToLoadPolicyDetail = m("FailedToLoadPolicyDetail", {
  requestId: Schema.Int,
  repository: Repository,
  policyId: PolicyId,
  message: Schema.String,
})
export const ClosedPolicyEditor = m("ClosedPolicyEditor")
export const UpdatedPolicyName = m("UpdatedPolicyName", { name: Schema.String })
export const UpdatedPolicyDescription = m("UpdatedPolicyDescription", {
  description: Schema.String,
})
export const GotPolicyCodeEditorMessage = m("GotPolicyCodeEditorMessage", {
  message: PolicyCodeEditor.Message,
})
export const ToggledAppliesWhen = m("ToggledAppliesWhen", {
  enabled: Schema.Boolean,
})
export const ChangedConditionKind = m("ChangedConditionKind", {
  clientId: Schema.String,
  kind: NodeKind,
})
export const AddedConditionChild = m("AddedConditionChild", {
  clientId: Schema.String,
})
export const RemovedConditionNode = m("RemovedConditionNode", {
  clientId: Schema.String,
})
export const UpdatedFact = m("UpdatedFact", {
  clientId: Schema.String,
  fact: PolicyProgram.PullRequestScalarFact,
})
export const UpdatedOperator = m("UpdatedOperator", {
  clientId: Schema.String,
  operator: Operator,
})
export const UpdatedOperand = m("UpdatedOperand", {
  clientId: Schema.String,
  value: Schema.String,
})
export const UpdatedCollectionFact = m("UpdatedCollectionFact", {
  clientId: Schema.String,
  fact: PolicyProgram.PullRequestCollectionFact,
})
export const UpdatedQuantifier = m("UpdatedQuantifier", {
  clientId: Schema.String,
  quantifier: Quantifier,
})
export const ChangedItemKind = m("ChangedItemKind", {
  clientId: Schema.String,
  kind: ItemKind,
})
export const AddedItemChild = m("AddedItemChild", { clientId: Schema.String })
export const RemovedItemNode = m("RemovedItemNode", {
  clientId: Schema.String,
})
export const UpdatedItemField = m("UpdatedItemField", {
  clientId: Schema.String,
  field: Schema.String,
})
export const UpdatedItemOperator = m("UpdatedItemOperator", {
  clientId: Schema.String,
  operator: Operator,
})
export const UpdatedItemOperand = m("UpdatedItemOperand", {
  clientId: Schema.String,
  value: Schema.String,
})
export const UpdatedPolicyReference = m("UpdatedPolicyReference", {
  clientId: Schema.String,
  policyVersionId: PolicyVersionId,
})
export const SavedPolicy = m("SavedPolicy")
export const RetriedPolicySave = m("RetriedPolicySave")
export const ReloadedPolicyEditor = m("ReloadedPolicyEditor")
export const CompletedSavePolicy = m("CompletedSavePolicy", {
  requestId: Schema.Int,
  repository: Repository,
  policy: PolicyManagement.PublicPolicy,
})
export const FailedToSavePolicy = m("FailedToSavePolicy", {
  requestId: Schema.Int,
  repository: Repository,
  message: Schema.String,
  currentPolicy: Schema.NullOr(PolicyManagement.PublicPolicy),
  currentDraftVersion: Schema.NullOr(Schema.Int),
})
export const ValidatedPolicy = m("ValidatedPolicy")
export const CompletedValidatePolicy = m("CompletedValidatePolicy", {
  requestId: Schema.Int,
  repository: Repository,
  policyId: PolicyId,
  result: PolicyManagement.ValidatePolicyResponse,
})
export const FailedToValidatePolicy = m("FailedToValidatePolicy", {
  requestId: Schema.Int,
  repository: Repository,
  policyId: PolicyId,
  message: Schema.String,
})
export const GotPolicyMenuMessage = m("GotPolicyMenuMessage", {
  policyId: PolicyId,
  message: Menu.Message,
})
export const GotPolicyEditorDialogMessage = m("GotPolicyEditorDialogMessage", {
  message: Dialog.Message,
})

export const OpenedPublishPolicy = m("OpenedPublishPolicy", {
  policyId: PolicyId,
})
export const DismissedPublishPolicy = m("DismissedPublishPolicy")
export const ConfirmedPublishPolicy = m("ConfirmedPublishPolicy")
export const CompletedPublishPolicy = m("CompletedPublishPolicy", {
  requestId: Schema.Int,
  repository: Repository,
  result: PolicyManagement.PublishPolicyResponse,
})
export const FailedToPublishPolicy = m("FailedToPublishPolicy", {
  requestId: Schema.Int,
  repository: Repository,
  message: Schema.String,
})
export const GotPublishDialogMessage = m("GotPublishDialogMessage", {
  message: Dialog.Message,
})

export const OpenedNewRule = m("OpenedNewRule")
export const OpenedRuleEditor = m("OpenedRuleEditor", { ruleId: RuleId })
export const ClosedRuleEditor = m("ClosedRuleEditor")
export const ChangedRuleType = m("ChangedRuleType", {
  ruleType: Schema.Literals(["PolicyLabelingRule", "AiLabelingRule"]),
})
export const UpdatedRulePolicy = m("UpdatedRulePolicy", { policyId: PolicyId })
export const GotAiPromptEditorMessage = m("GotAiPromptEditorMessage", {
  message: AiPromptEditor.Message,
})
export const ToggledRuleEvidence = m("ToggledRuleEvidence", {
  fact: PolicyProgram.PullRequestFact,
})
export const GotConfidenceSliderMessage = m("GotConfidenceSliderMessage", {
  message: Slider.Message,
})
export const GotRuleToastMessage = m("GotRuleToastMessage", {
  message: Toast.Message,
})
export const UpdatedRuleGatePolicy = m("UpdatedRuleGatePolicy", {
  gatePolicyId: Schema.NullOr(PolicyId),
})
export const UpdatedRuleLabel = m("UpdatedRuleLabel", { label: Schema.String })
export const UpdatedRuleNoMatch = m("UpdatedRuleNoMatch", {
  onNoMatch: Schema.Literals(["ensure-absent", "preserve"]),
})
export const UpdatedRuleConflictGroup = m("UpdatedRuleConflictGroup", {
  conflictGroup: Schema.String,
})
export const UpdatedRulePriority = m("UpdatedRulePriority", {
  priority: Schema.Int,
})
export const SavedRule = m("SavedRule")
export const RetriedRuleSave = m("RetriedRuleSave")
export const ReloadedRuleEditor = m("ReloadedRuleEditor")
export const CompletedSaveRule = m("CompletedSaveRule", {
  requestId: Schema.Int,
  repository: Repository,
  rule: RuleManagement.PublicLabelingRule,
})
export const FailedToSaveRule = m("FailedToSaveRule", {
  requestId: Schema.Int,
  repository: Repository,
  message: Schema.String,
  currentRule: Schema.NullOr(RuleManagement.PublicLabelingRule),
  revisionConflict: Schema.Boolean,
})
export const GotRuleMenuMessage = m("GotRuleMenuMessage", {
  ruleId: RuleId,
  message: Menu.Message,
})
export const GotRuleEditorDialogMessage = m("GotRuleEditorDialogMessage", {
  message: Dialog.Message,
})
export const ToggledRule = m("ToggledRule", { ruleId: RuleId })
export const CompletedToggleRule = m("CompletedToggleRule", {
  requestId: Schema.Int,
  repository: Repository,
  rule: RuleManagement.PublicLabelingRule,
})
export const FailedToToggleRule = m("FailedToToggleRule", {
  requestId: Schema.Int,
  repository: Repository,
  ruleId: RuleId,
  message: Schema.String,
  currentRule: Schema.NullOr(RuleManagement.PublicLabelingRule),
  revisionConflict: Schema.Boolean,
})
export const RetriedToggleRule = m("RetriedToggleRule")
export const DismissedRowMutationError = m("DismissedRowMutationError")
export const OpenedDeleteRule = m("OpenedDeleteRule", { ruleId: RuleId })
export const DismissedDeleteRule = m("DismissedDeleteRule")
export const ConfirmedDeleteRule = m("ConfirmedDeleteRule")
export const CompletedDeleteRule = m("CompletedDeleteRule", {
  requestId: Schema.Int,
  repository: Repository,
  ruleId: RuleId,
})
export const FailedToDeleteRule = m("FailedToDeleteRule", {
  requestId: Schema.Int,
  repository: Repository,
  message: Schema.String,
  currentRule: Schema.NullOr(RuleManagement.PublicLabelingRule),
  revisionConflict: Schema.Boolean,
})
export const GotRuleDeleteDialogMessage = m("GotRuleDeleteDialogMessage", {
  message: Dialog.Message,
})

export const OpenedRuleTest = m("OpenedRuleTest", { ruleId: RuleId })
export const LoadedRuleTestCandidates = m("LoadedRuleTestCandidates", {
  requestId: Schema.Int,
  repository: Repository,
  ruleId: RuleId,
  candidates: Schema.Array(RuleManagement.RuleTestCandidate),
})
export const FailedToLoadRuleTestCandidates = m(
  "FailedToLoadRuleTestCandidates",
  {
    requestId: Schema.Int,
    repository: Repository,
    ruleId: RuleId,
    message: Schema.String,
  },
)
export const SelectedRuleTestCandidate = m("SelectedRuleTestCandidate", {
  pullRequestNumber: Schema.Int,
})
export const RanRuleTest = m("RanRuleTest")
export const CompletedRuleTest = m("CompletedRuleTest", {
  requestId: Schema.Int,
  repository: Repository,
  result: RuleManagement.TestLabelingRuleResponse,
})
export const FailedRuleTest = m("FailedRuleTest", {
  requestId: Schema.Int,
  repository: Repository,
  message: Schema.String,
})
export const ResetRuleTest = m("ResetRuleTest")
export const DismissedRuleTest = m("DismissedRuleTest")
export const GotRuleTestDialogMessage = m("GotRuleTestDialogMessage", {
  message: Dialog.Message,
})

export const OpenedPolicyTest = m("OpenedPolicyTest", { policyId: PolicyId })
export const LoadedPolicyTestCandidates = m("LoadedPolicyTestCandidates", {
  requestId: Schema.Int,
  repository: Repository,
  policyId: PolicyId,
  candidates: Schema.Array(RuleManagement.RuleTestCandidate),
})
export const FailedToLoadPolicyTestCandidates = m(
  "FailedToLoadPolicyTestCandidates",
  {
    requestId: Schema.Int,
    repository: Repository,
    policyId: PolicyId,
    message: Schema.String,
  },
)
export const SelectedPolicyTestCandidate = m("SelectedPolicyTestCandidate", {
  pullRequestNumber: Schema.Int,
})
export const RanPolicyTest = m("RanPolicyTest")
export const CompletedPolicyTest = m("CompletedPolicyTest", {
  requestId: Schema.Int,
  repository: Repository,
  result: PolicyManagement.TestPolicyResponse,
})
export const FailedPolicyTest = m("FailedPolicyTest", {
  requestId: Schema.Int,
  repository: Repository,
  message: Schema.String,
})
export const ResetPolicyTest = m("ResetPolicyTest")
export const DismissedPolicyTest = m("DismissedPolicyTest")
export const GotTestDialogMessage = m("GotTestDialogMessage", {
  message: Dialog.Message,
})

export const Message = Schema.Union([
  SelectedRepositoryChanged,
  RetriedRepositoryLoad,
  LoadedRepositoryData,
  FailedToLoadRepositoryData,
  IgnoredInput,
  OpenedNewPolicy,
  OpenedPolicyEditor,
  LoadedPolicyDetail,
  FailedToLoadPolicyDetail,
  ClosedPolicyEditor,
  UpdatedPolicyName,
  UpdatedPolicyDescription,
  GotPolicyCodeEditorMessage,
  ToggledAppliesWhen,
  ChangedConditionKind,
  AddedConditionChild,
  RemovedConditionNode,
  UpdatedFact,
  UpdatedOperator,
  UpdatedOperand,
  UpdatedCollectionFact,
  UpdatedQuantifier,
  ChangedItemKind,
  AddedItemChild,
  RemovedItemNode,
  UpdatedItemField,
  UpdatedItemOperator,
  UpdatedItemOperand,
  UpdatedPolicyReference,
  SavedPolicy,
  RetriedPolicySave,
  ReloadedPolicyEditor,
  CompletedSavePolicy,
  FailedToSavePolicy,
  ValidatedPolicy,
  CompletedValidatePolicy,
  FailedToValidatePolicy,
  GotPolicyMenuMessage,
  GotPolicyEditorDialogMessage,
  OpenedPublishPolicy,
  DismissedPublishPolicy,
  ConfirmedPublishPolicy,
  CompletedPublishPolicy,
  FailedToPublishPolicy,
  GotPublishDialogMessage,
  OpenedNewRule,
  OpenedRuleEditor,
  ClosedRuleEditor,
  ChangedRuleType,
  UpdatedRulePolicy,
  GotAiPromptEditorMessage,
  ToggledRuleEvidence,
  GotConfidenceSliderMessage,
  GotRuleToastMessage,
  UpdatedRuleGatePolicy,
  UpdatedRuleLabel,
  UpdatedRuleNoMatch,
  UpdatedRuleConflictGroup,
  UpdatedRulePriority,
  SavedRule,
  RetriedRuleSave,
  ReloadedRuleEditor,
  CompletedSaveRule,
  FailedToSaveRule,
  GotRuleMenuMessage,
  GotRuleEditorDialogMessage,
  ToggledRule,
  CompletedToggleRule,
  FailedToToggleRule,
  RetriedToggleRule,
  DismissedRowMutationError,
  OpenedDeleteRule,
  DismissedDeleteRule,
  ConfirmedDeleteRule,
  CompletedDeleteRule,
  FailedToDeleteRule,
  GotRuleDeleteDialogMessage,
  OpenedRuleTest,
  LoadedRuleTestCandidates,
  FailedToLoadRuleTestCandidates,
  SelectedRuleTestCandidate,
  RanRuleTest,
  CompletedRuleTest,
  FailedRuleTest,
  ResetRuleTest,
  DismissedRuleTest,
  GotRuleTestDialogMessage,
  OpenedPolicyTest,
  LoadedPolicyTestCandidates,
  FailedToLoadPolicyTestCandidates,
  SelectedPolicyTestCandidate,
  RanPolicyTest,
  CompletedPolicyTest,
  FailedPolicyTest,
  ResetPolicyTest,
  DismissedPolicyTest,
  GotTestDialogMessage,
])
export type Message = typeof Message.Type
export type { RuleDraft }

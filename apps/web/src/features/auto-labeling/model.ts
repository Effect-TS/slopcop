import * as Dialog from "@foldkit/ui/dialog"
import * as Menu from "@foldkit/ui/menu"
import * as GitHubLabel from "@slopcop/domain/GitHub/GitHubLabel"
import * as RepositoryManagement from "@slopcop/domain/GitHub/RepositoryManagement"
import * as LabelingPolicy from "@slopcop/domain/Labeling/LabelingPolicy"
import * as PolicyManagement from "@slopcop/domain/Labeling/LabelingPolicyManagement"
import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import * as RuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import * as PolicyProgram from "@slopcop/domain/Policy/PolicyProgram"
import * as Schema from "effect/Schema"
import * as PolicyCodeEditor from "../../components/policy-editor"
import { PolicyDraft } from "./condition"

export const Repository = RepositoryManagement.RepositoryPath
export type Repository = typeof Repository.Type
export const PolicyId = LabelingPolicy.LabelingPolicyId
export type PolicyId = typeof PolicyId.Type
export const PolicyVersionId = PolicyProgram.PolicyVersionId
export type PolicyVersionId = typeof PolicyVersionId.Type
export const RuleId = LabelingRule.LabelingRuleId
export type RuleId = typeof RuleId.Type
export const Tab = Schema.Literals(["Policies", "Label rules"])
export type Tab = typeof Tab.Type
export const PolicyAction = Schema.Literals(["Edit", "Test", "Publish"])
export type PolicyAction = typeof PolicyAction.Type
export const RuleAction = Schema.Literals(["Edit", "Delete"])
export type RuleAction = typeof RuleAction.Type
export const PolicyActionMenu: ReturnType<typeof Menu.create<PolicyAction>> =
  Menu.create<PolicyAction>()
export const RuleActionMenu: ReturnType<typeof Menu.create<RuleAction>> =
  Menu.create<RuleAction>()

export const NewPolicy = Schema.TaggedStruct("NewPolicy", {})
export const ExistingPolicy = Schema.TaggedStruct("ExistingPolicy", {
  id: PolicyId,
  draftVersion: Schema.Int,
})
export const PolicyIdentity = Schema.Union([NewPolicy, ExistingPolicy]).pipe(
  Schema.toTaggedUnion("_tag"),
)
export type PolicyIdentity = typeof PolicyIdentity.Type
export const NewRule = Schema.TaggedStruct("NewRule", {})
export const ExistingRule = Schema.TaggedStruct("ExistingRule", {
  id: RuleId,
  version: Schema.Int,
})
export const RuleIdentity = Schema.Union([NewRule, ExistingRule]).pipe(
  Schema.toTaggedUnion("_tag"),
)
export type RuleIdentity = typeof RuleIdentity.Type

export const RuleDraft = Schema.Struct({
  policyId: PolicyId,
  label: Schema.String,
  onNoMatch: LabelingRule.LabelOnNoMatch,
  conflictGroup: Schema.String,
  priority: Schema.Int,
  enabled: Schema.Boolean,
})
export type RuleDraft = typeof RuleDraft.Type

export const RepositoryData = Schema.Struct({
  repository: Repository,
  policyRevision: Schema.Int,
  ruleRevision: Schema.Int,
  policies: Schema.Array(PolicyManagement.PublicPolicy),
  rules: Schema.Array(RuleManagement.PublicLabelingRule),
  activity: RuleManagement.LabelingRuleActivitySummary,
  audit: Schema.Array(RuleManagement.PublicLabelingRuleAuditEntry),
  labels: Schema.Array(GitHubLabel.GitHubLabel),
})
export type RepositoryData = typeof RepositoryData.Type
export const RepositoryRequest = Schema.Struct({
  requestId: Schema.Int,
  repository: Repository,
})
export const NoRepository = Schema.TaggedStruct("NoRepository", {})
export const LoadingRepository = Schema.TaggedStruct("LoadingRepository", {
  repository: Repository,
})
export const LoadedRepository = Schema.TaggedStruct("LoadedRepository", {
  data: RepositoryData,
})
export const FailedRepository = Schema.TaggedStruct("FailedRepository", {
  repository: Repository,
  message: Schema.String,
})
export const RepositoryState = Schema.Union([
  NoRepository,
  LoadingRepository,
  LoadedRepository,
  FailedRepository,
]).pipe(Schema.toTaggedUnion("_tag"))

const PolicyEditorFields = {
  draft: PolicyDraft,
  sourceEditor: PolicyCodeEditor.Model,
  identity: PolicyIdentity,
  dirty: Schema.Boolean,
}
export const PolicyEditorClosed = Schema.TaggedStruct("PolicyEditorClosed", {})
export const PolicyEditorLoading = Schema.TaggedStruct("PolicyEditorLoading", {
  policy: PolicyManagement.PublicPolicy,
  requestId: Schema.Int,
})
export const PolicyEditorEditing = Schema.TaggedStruct(
  "PolicyEditorEditing",
  PolicyEditorFields,
)
export const PolicyEditorSaving = Schema.TaggedStruct("PolicyEditorSaving", {
  ...PolicyEditorFields,
  requestId: Schema.Int,
})
export const PolicyEditorFailed = Schema.TaggedStruct("PolicyEditorFailed", {
  ...PolicyEditorFields,
  message: Schema.String,
})
export const PolicyEditorConflict = Schema.TaggedStruct(
  "PolicyEditorConflict",
  {
    ...PolicyEditorFields,
    message: Schema.String,
    currentPolicy: PolicyManagement.PublicPolicy,
    currentDraftVersion: Schema.Int,
  },
)
export const PolicyEditorState = Schema.Union([
  PolicyEditorClosed,
  PolicyEditorLoading,
  PolicyEditorEditing,
  PolicyEditorSaving,
  PolicyEditorFailed,
  PolicyEditorConflict,
]).pipe(Schema.toTaggedUnion("_tag"))

export const ValidationIdle = Schema.TaggedStruct("ValidationIdle", {})
export const ValidationRunning = Schema.TaggedStruct("ValidationRunning", {
  requestId: Schema.Int,
  policyId: PolicyId,
})
export const ValidationResult = Schema.TaggedStruct("ValidationResult", {
  result: PolicyManagement.ValidatePolicyResponse,
})
export const ValidationFailed = Schema.TaggedStruct("ValidationFailed", {
  message: Schema.String,
})
export const ValidationState = Schema.Union([
  ValidationIdle,
  ValidationRunning,
  ValidationResult,
  ValidationFailed,
]).pipe(Schema.toTaggedUnion("_tag"))

export const PublishClosed = Schema.TaggedStruct("PublishClosed", {})
export const PublishConfirming = Schema.TaggedStruct("PublishConfirming", {
  policy: PolicyManagement.PublicPolicy,
})
export const Publishing = Schema.TaggedStruct("Publishing", {
  policy: PolicyManagement.PublicPolicy,
  requestId: Schema.Int,
})
export const PublishResult = Schema.TaggedStruct("PublishResult", {
  result: PolicyManagement.PublishPolicyResponse,
})
export const PublishFailed = Schema.TaggedStruct("PublishFailed", {
  policy: PolicyManagement.PublicPolicy,
  message: Schema.String,
})
export const PublishState = Schema.Union([
  PublishClosed,
  PublishConfirming,
  Publishing,
  PublishResult,
  PublishFailed,
]).pipe(Schema.toTaggedUnion("_tag"))

const RuleEditorFields = { draft: RuleDraft, identity: RuleIdentity }
export const RuleEditorClosed = Schema.TaggedStruct("RuleEditorClosed", {})
export const RuleEditorEditing = Schema.TaggedStruct(
  "RuleEditorEditing",
  RuleEditorFields,
)
export const RuleEditorSaving = Schema.TaggedStruct("RuleEditorSaving", {
  ...RuleEditorFields,
  requestId: Schema.Int,
})
export const RuleEditorFailed = Schema.TaggedStruct("RuleEditorFailed", {
  ...RuleEditorFields,
  message: Schema.String,
})
export const RuleEditorConflict = Schema.TaggedStruct("RuleEditorConflict", {
  ...RuleEditorFields,
  message: Schema.String,
  currentRule: RuleManagement.PublicLabelingRule,
})
export const RuleEditorState = Schema.Union([
  RuleEditorClosed,
  RuleEditorEditing,
  RuleEditorSaving,
  RuleEditorFailed,
  RuleEditorConflict,
]).pipe(Schema.toTaggedUnion("_tag"))

export const RuleDeleteClosed = Schema.TaggedStruct("RuleDeleteClosed", {})
export const RuleDeleteConfirming = Schema.TaggedStruct(
  "RuleDeleteConfirming",
  { rule: RuleManagement.PublicLabelingRule },
)
export const RuleDeleting = Schema.TaggedStruct("RuleDeleting", {
  rule: RuleManagement.PublicLabelingRule,
  requestId: Schema.Int,
})
export const RuleDeleteFailed = Schema.TaggedStruct("RuleDeleteFailed", {
  rule: RuleManagement.PublicLabelingRule,
  message: Schema.String,
})
export const RuleDeleteState = Schema.Union([
  RuleDeleteClosed,
  RuleDeleteConfirming,
  RuleDeleting,
  RuleDeleteFailed,
]).pipe(Schema.toTaggedUnion("_tag"))

const TestSelection = {
  policy: PolicyManagement.PublicPolicy,
  candidates: Schema.Array(RuleManagement.RuleTestCandidate),
  selectedPullRequest: Schema.NullOr(Schema.Int),
}
export const TestClosed = Schema.TaggedStruct("TestClosed", {})
export const TestLoadingCandidates = Schema.TaggedStruct(
  "TestLoadingCandidates",
  { policy: PolicyManagement.PublicPolicy, requestId: Schema.Int },
)
export const TestConfiguring = Schema.TaggedStruct(
  "TestConfiguring",
  TestSelection,
)
export const TestRunning = Schema.TaggedStruct("TestRunning", {
  ...TestSelection,
  requestId: Schema.Int,
})
export const TestResult = Schema.TaggedStruct("TestResult", {
  ...TestSelection,
  result: PolicyManagement.TestPolicyResponse,
})
export const TestFailed = Schema.TaggedStruct("TestFailed", {
  ...TestSelection,
  message: Schema.String,
})
export const TestState = Schema.Union([
  TestClosed,
  TestLoadingCandidates,
  TestConfiguring,
  TestRunning,
  TestResult,
  TestFailed,
]).pipe(Schema.toTaggedUnion("_tag"))

export const RowMutationIdle = Schema.TaggedStruct("RowMutationIdle", {})
export const RowMutationSaving = Schema.TaggedStruct("RowMutationSaving", {
  ruleId: RuleId,
  requestId: Schema.Int,
  enabled: Schema.Boolean,
})
export const RowMutationFailed = Schema.TaggedStruct("RowMutationFailed", {
  ruleId: RuleId,
  enabled: Schema.Boolean,
  message: Schema.String,
  currentRule: Schema.NullOr(RuleManagement.PublicLabelingRule),
})
export const RowMutationState = Schema.Union([
  RowMutationIdle,
  RowMutationSaving,
  RowMutationFailed,
]).pipe(Schema.toTaggedUnion("_tag"))

export const Model = Schema.Struct({
  tab: Tab,
  repository: RepositoryState,
  repositoryRequest: Schema.NullOr(RepositoryRequest),
  refreshError: Schema.NullOr(Schema.String),
  statusMessage: Schema.NullOr(Schema.String),
  nextRequestId: Schema.Int,
  nextNodeSequence: Schema.Int,
  policyEditor: PolicyEditorState,
  validation: ValidationState,
  publishing: PublishState,
  ruleEditor: RuleEditorState,
  ruleDeletion: RuleDeleteState,
  test: TestState,
  rowMutation: RowMutationState,
  policyEditorDialog: Dialog.Model,
  publishDialog: Dialog.Model,
  ruleEditorDialog: Dialog.Model,
  ruleDeleteDialog: Dialog.Model,
  testDialog: Dialog.Model,
  policyMenus: Schema.Record(Schema.String, Menu.Model),
  ruleMenus: Schema.Record(Schema.String, Menu.Model),
})
export type Model = typeof Model.Type

export const currentRepository = (model: Model): Repository | null =>
  model.repository._tag === "NoRepository"
    ? null
    : model.repository._tag === "LoadedRepository"
      ? model.repository.data.repository
      : model.repository.repository

export const ruleDraftFrom = (
  rule: typeof RuleManagement.PublicLabelingRule.Type,
): RuleDraft => ({
  policyId: rule.policyId,
  label: rule.label,
  onNoMatch: rule.onNoMatch,
  conflictGroup: rule.conflictGroup ?? "",
  priority: rule.priority,
  enabled: rule.enabled,
})

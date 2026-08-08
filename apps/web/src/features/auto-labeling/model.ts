import * as GitHubLabel from "@slopcop/domain/GitHub/GitHubLabel"
import * as RepositoryManagement from "@slopcop/domain/GitHub/RepositoryManagement"
import * as LabelingRule from "@slopcop/domain/Labeling/LabelingRule"
import * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import * as Dialog from "@foldkit/ui/dialog"
import * as Menu from "@foldkit/ui/menu"
import * as Schema from "effect/Schema"

export const Repository = RepositoryManagement.RepositoryPath
export type Repository = typeof Repository.Type

export const RuleId = LabelingRule.LabelingRuleId
export type RuleId = typeof RuleId.Type

export const RuleMode = LabelingRule.LabelingRuleMode
export type RuleMode = typeof RuleMode.Type

export const RuleKind = LabelingRule.LabelingRuleKind
export type RuleKind = typeof RuleKind.Type

export const RuleAction = Schema.Literals(["Edit", "Test", "Delete"])
export type RuleAction = typeof RuleAction.Type
export const RuleActionMenu: ReturnType<typeof Menu.create<RuleAction>> =
  Menu.create<RuleAction>()

export const RuleDraft = Schema.Struct({
  name: Schema.String,
  label: Schema.String,
  kind: RuleKind,
  instructions: Schema.String,
  confidenceThreshold: Schema.Number,
  mode: RuleMode,
  exclusiveGroup: Schema.String,
  enabled: Schema.Boolean,
})
export type RuleDraft = typeof RuleDraft.Type

export const RepositoryData = Schema.Struct({
  repository: Repository,
  revision: Schema.Int,
  rules: Schema.Array(LabelingRuleManagement.PublicLabelingRule),
  activity: LabelingRuleManagement.LabelingRuleActivitySummary,
  labels: Schema.Array(GitHubLabel.GitHubLabel),
})
export type RepositoryData = typeof RepositoryData.Type

export const RepositoryRequest = Schema.Struct({
  requestId: Schema.Int,
  repository: Repository,
})
export type RepositoryRequest = typeof RepositoryRequest.Type

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
export type RepositoryState = typeof RepositoryState.Type

const EditorFields = {
  draft: RuleDraft,
  ruleId: Schema.NullOr(RuleId),
  version: Schema.NullOr(Schema.Int),
}
export const RuleVersionConflict = Schema.TaggedStruct("RuleVersionConflict", {
  expectedVersion: Schema.Int,
  currentRule: LabelingRuleManagement.PublicLabelingRule,
})
export const RepositoryRevisionConflict = Schema.TaggedStruct(
  "RepositoryRevisionConflict",
  {
    expectedRevision: Schema.Int,
    actualRevision: Schema.Int,
    currentRule: Schema.NullOr(LabelingRuleManagement.PublicLabelingRule),
  },
)
export const MutationConflict = Schema.Union([
  RuleVersionConflict,
  RepositoryRevisionConflict,
]).pipe(Schema.toTaggedUnion("_tag"))
export type MutationConflict = typeof MutationConflict.Type

export const EditorClosed = Schema.TaggedStruct("EditorClosed", {})
export const EditorEditing = Schema.TaggedStruct("EditorEditing", EditorFields)
export const EditorSaving = Schema.TaggedStruct("EditorSaving", {
  ...EditorFields,
  requestId: Schema.Int,
})
export const EditorFailed = Schema.TaggedStruct("EditorFailed", {
  ...EditorFields,
  message: Schema.String,
})
export const EditorConflict = Schema.TaggedStruct("EditorConflict", {
  ...EditorFields,
  message: Schema.String,
  conflict: MutationConflict,
})
export const EditorState = Schema.Union([
  EditorClosed,
  EditorEditing,
  EditorSaving,
  EditorFailed,
  EditorConflict,
]).pipe(Schema.toTaggedUnion("_tag"))
export type EditorState = typeof EditorState.Type

export const DeleteClosed = Schema.TaggedStruct("DeleteClosed", {})
export const DeleteConfirming = Schema.TaggedStruct("DeleteConfirming", {
  rule: LabelingRuleManagement.PublicLabelingRule,
})
export const DeleteDeleting = Schema.TaggedStruct("DeleteDeleting", {
  rule: LabelingRuleManagement.PublicLabelingRule,
  requestId: Schema.Int,
})
export const DeleteFailed = Schema.TaggedStruct("DeleteFailed", {
  rule: LabelingRuleManagement.PublicLabelingRule,
  message: Schema.String,
})
export const DeleteConflict = Schema.TaggedStruct("DeleteConflict", {
  rule: LabelingRuleManagement.PublicLabelingRule,
  message: Schema.String,
  conflict: MutationConflict,
})
export const DeleteState = Schema.Union([
  DeleteClosed,
  DeleteConfirming,
  DeleteDeleting,
  DeleteFailed,
  DeleteConflict,
]).pipe(Schema.toTaggedUnion("_tag"))
export type DeleteState = typeof DeleteState.Type

const TestSelection = {
  rule: LabelingRuleManagement.PublicLabelingRule,
  candidates: Schema.Array(LabelingRuleManagement.RuleTestCandidate),
  selectedPullRequest: Schema.NullOr(Schema.Int),
}
export const TestClosed = Schema.TaggedStruct("TestClosed", {})
export const TestLoadingCandidates = Schema.TaggedStruct(
  "TestLoadingCandidates",
  { rule: LabelingRuleManagement.PublicLabelingRule },
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
  result: LabelingRuleManagement.TestLabelingRuleResponse,
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
export type TestState = typeof TestState.Type

export const RowMutationIdle = Schema.TaggedStruct("RowMutationIdle", {})
export const RowMutationSaving = Schema.TaggedStruct("RowMutationSaving", {
  ruleId: RuleId,
  requestId: Schema.Int,
  expectedVersion: Schema.Int,
  enabled: Schema.Boolean,
})
export const RowMutationFailed = Schema.TaggedStruct("RowMutationFailed", {
  ruleId: RuleId,
  message: Schema.String,
})
export const RowMutationConflict = Schema.TaggedStruct("RowMutationConflict", {
  ruleId: RuleId,
  expectedVersion: Schema.Int,
  enabled: Schema.Boolean,
  message: Schema.String,
  conflict: MutationConflict,
})
export const RowMutationState = Schema.Union([
  RowMutationIdle,
  RowMutationSaving,
  RowMutationFailed,
  RowMutationConflict,
]).pipe(Schema.toTaggedUnion("_tag"))
export type RowMutationState = typeof RowMutationState.Type

export const Model = Schema.Struct({
  repository: RepositoryState,
  repositoryRequest: Schema.NullOr(RepositoryRequest),
  nextRequestId: Schema.Int,
  editor: EditorState,
  deletion: DeleteState,
  test: TestState,
  rowMutation: RowMutationState,
  editorDialog: Dialog.Model,
  deleteDialog: Dialog.Model,
  testDialog: Dialog.Model,
  ruleMenus: Schema.Record(Schema.String, Menu.Model),
})
export type Model = typeof Model.Type

export const draftFromRule = (
  rule: typeof LabelingRuleManagement.PublicLabelingRule.Type,
): RuleDraft => ({
  name: rule.name,
  label: rule.label,
  kind: rule.kind,
  instructions: rule.instructions,
  confidenceThreshold: rule.confidenceThreshold,
  mode: rule.mode,
  exclusiveGroup: rule.exclusiveGroup ?? "",
  enabled: rule.enabled,
})

export const currentRepository = (model: Model): Repository | null => {
  switch (model.repository._tag) {
    case "NoRepository":
      return null
    case "LoadingRepository":
    case "FailedRepository":
      return model.repository.repository
    case "LoadedRepository":
      return model.repository.data.repository
  }
}

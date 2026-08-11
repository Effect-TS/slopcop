import * as Dialog from "@foldkit/ui/dialog"
import * as Slider from "@foldkit/ui/slider"
import {
  PolicyEditorState,
  PublishState,
  RepositoryState,
  RowMutationState,
  RuleDeleteState,
  RuleEditorState,
  RuleTestState,
  TestState,
  ValidationState,
  type Model,
} from "./model"
import { Toast } from "./toast"

export const init = (): Model => ({
  repository: RepositoryState.cases.NoRepository.make({}),
  repositoryRequest: null,
  refreshError: null,
  statusMessage: null,
  nextRequestId: 1,
  nextNodeSequence: 1,
  policyEditor: PolicyEditorState.cases.PolicyEditorClosed.make({}),
  validation: ValidationState.cases.ValidationIdle.make({}),
  publishing: PublishState.cases.PublishClosed.make({}),
  ruleEditor: RuleEditorState.cases.RuleEditorClosed.make({}),
  ruleDeletion: RuleDeleteState.cases.RuleDeleteClosed.make({}),
  test: TestState.cases.TestClosed.make({}),
  ruleTest: RuleTestState.cases.RuleTestClosed.make({}),
  rowMutation: RowMutationState.cases.RowMutationIdle.make({}),
  confidenceSlider: Slider.init({
    id: "ai-rule-confidence",
    min: 0,
    max: 1,
    step: 0.1,
  }),
  toast: Toast.init({ id: "auto-labeling-toast" }),
  policyEditorDialog: Dialog.init({ id: "policy-editor" }),
  publishDialog: Dialog.init({ id: "publish-policy" }),
  ruleEditorDialog: Dialog.init({ id: "rule-editor" }),
  ruleDeleteDialog: Dialog.init({ id: "delete-rule" }),
  testDialog: Dialog.init({ id: "policy-test" }),
  ruleTestDialog: Dialog.init({ id: "rule-test" }),
  policyMenus: {},
  ruleMenus: {},
})

import {
  DeleteState,
  EditorState,
  RepositoryState,
  RowMutationState,
  TestState,
  type Model,
} from "./model"

export const init = (): Model => ({
  repository: RepositoryState.cases.NoRepository.make({}),
  repositoryRequest: null,
  nextRequestId: 1,
  editor: EditorState.cases.EditorClosed.make({}),
  deletion: DeleteState.cases.DeleteClosed.make({}),
  test: TestState.cases.TestClosed.make({}),
  rowMutation: RowMutationState.cases.RowMutationIdle.make({}),
  editorDialog: Dialog.init({ id: "rule-editor" }),
  deleteDialog: Dialog.init({ id: "delete-rule" }),
  testDialog: Dialog.init({ id: "rule-test" }),
  ruleMenus: {},
})
import * as Dialog from "@foldkit/ui/dialog"

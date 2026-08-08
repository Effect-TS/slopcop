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
  editor: EditorState.cases.EditorClosed.make({}),
  deletion: DeleteState.cases.DeleteClosed.make({}),
  test: TestState.cases.TestClosed.make({}),
  rowMutation: RowMutationState.cases.RowMutationIdle.make({}),
  openRuleMenu: null,
})

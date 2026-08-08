import * as Match from "effect/Match"
import { evo } from "foldkit/struct"
import {
  DeleteRule,
  LoadRepositoryData,
  LoadRuleTestCandidates,
  SaveRule,
  TestRule,
  ToggleRule,
  type Command,
} from "./command"
import type { Message } from "./message"
import {
  currentRepository,
  DeleteState,
  draftFromRule,
  EditorState,
  RepositoryState,
  RowMutationState,
  TestState,
  type Model,
  type MutationConflict,
  type Repository,
  type RuleDraft,
  type RuleId,
} from "./model"

export type UpdateReturn = readonly [Model, ReadonlyArray<Command>]

const sameRepository = (left: Repository | null, right: Repository): boolean =>
  left !== null && left.owner === right.owner && left.repo === right.repo

const loadedRule = (model: Model, ruleId: RuleId) =>
  model.repository._tag === "LoadedRepository"
    ? (model.repository.data.rules.find((rule) => rule.id === ruleId) ?? null)
    : null

const defaultDraft = (model: Model): RuleDraft => ({
  name: "",
  label:
    model.repository._tag === "LoadedRepository"
      ? (model.repository.data.labels[0]?.name ?? "")
      : "",
  kind: "ai",
  instructions: "",
  confidenceThreshold: 0.8,
  mode: "add-only",
  exclusiveGroup: "",
  enabled: true,
})

const updateDraft = (
  model: Model,
  transform: (draft: RuleDraft) => RuleDraft,
): Model => {
  const editor = model.editor
  switch (editor._tag) {
    case "EditorClosed":
    case "EditorSaving":
      return model
    case "EditorEditing":
      return evo(model, {
        editor: () =>
          EditorState.cases.EditorEditing.make({
            draft: transform(editor.draft),
            ruleId: editor.ruleId,
            version: editor.version,
          }),
      })
    case "EditorFailed":
      return evo(model, {
        editor: () =>
          EditorState.cases.EditorEditing.make({
            draft: transform(editor.draft),
            ruleId: editor.ruleId,
            version: editor.version,
          }),
      })
    case "EditorConflict":
      return evo(model, {
        editor: () =>
          EditorState.cases.EditorConflict.make({
            draft: transform(editor.draft),
            ruleId: editor.ruleId,
            version: editor.version,
            message: editor.message,
            conflict: editor.conflict,
          }),
      })
  }
}

const requestRepository = (
  model: Model,
  repository: Repository,
  showLoading: boolean,
): UpdateReturn => {
  const requestId = model.nextRequestId
  return [
    evo(model, {
      repository: (state) =>
        showLoading
          ? RepositoryState.cases.LoadingRepository.make({ repository })
          : state,
      repositoryRequest: () => ({ requestId, repository }),
      nextRequestId: (id) => id + 1,
    }),
    [LoadRepositoryData({ requestId, repository })],
  ]
}

const latestRule = (
  model: Model,
  ruleId: RuleId,
  conflict: MutationConflict,
) => {
  const loaded = loadedRule(model, ruleId)
  const current = conflict.currentRule
  if (loaded === null) return current
  if (current === null || loaded.version >= current.version) return loaded
  return current
}

const isCurrentRepositoryRequest = (
  model: Model,
  repository: Repository,
  requestId: number,
): boolean =>
  model.repositoryRequest !== null &&
  model.repositoryRequest.requestId === requestId &&
  sameRepository(model.repositoryRequest.repository, repository)

export const update = (model: Model, message: Message): UpdateReturn =>
  Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tagsExhaustive({
      SelectedRepositoryChanged: ({ repository }) =>
        repository === null
          ? [
              evo(model, {
                repository: () => RepositoryState.cases.NoRepository.make({}),
                editor: () => EditorState.cases.EditorClosed.make({}),
                deletion: () => DeleteState.cases.DeleteClosed.make({}),
                test: () => TestState.cases.TestClosed.make({}),
                repositoryRequest: () => null,
                openRuleMenu: () => null,
              }),
              [],
            ]
          : requestRepository(
              evo(model, {
                editor: () => EditorState.cases.EditorClosed.make({}),
                deletion: () => DeleteState.cases.DeleteClosed.make({}),
                test: () => TestState.cases.TestClosed.make({}),
                rowMutation: () =>
                  RowMutationState.cases.RowMutationIdle.make({}),
                openRuleMenu: () => null,
              }),
              repository,
              true,
            ),
      RetriedRepositoryLoad: () => {
        const repository = currentRepository(model)
        return repository === null
          ? [model, []]
          : requestRepository(model, repository, true)
      },
      LoadedRepositoryData: ({
        activity,
        labels,
        repository,
        requestId,
        revision,
        rules,
      }) =>
        isCurrentRepositoryRequest(model, repository, requestId)
          ? [
              evo(model, {
                repository: () =>
                  RepositoryState.cases.LoadedRepository.make({
                    data: { repository, revision, rules, activity, labels },
                  }),
                repositoryRequest: () => null,
              }),
              [],
            ]
          : [model, []],
      FailedToLoadRepositoryData: ({ message, repository, requestId }) =>
        isCurrentRepositoryRequest(model, repository, requestId)
          ? [
              evo(model, {
                repository: (state) =>
                  state._tag === "LoadedRepository"
                    ? state
                    : RepositoryState.cases.FailedRepository.make({
                        repository,
                        message,
                      }),
                repositoryRequest: () => null,
              }),
              [],
            ]
          : [model, []],

      OpenedNewRule: () =>
        model.repository._tag !== "LoadedRepository"
          ? [model, []]
          : [
              evo(model, {
                editor: () =>
                  EditorState.cases.EditorEditing.make({
                    draft: defaultDraft(model),
                    ruleId: null,
                    version: null,
                  }),
              }),
              [],
            ],
      OpenedRuleEditor: ({ ruleId }) => {
        const rule = loadedRule(model, ruleId)
        return rule === null
          ? [model, []]
          : [
              evo(model, {
                editor: () =>
                  EditorState.cases.EditorEditing.make({
                    draft: draftFromRule(rule),
                    ruleId: rule.id,
                    version: rule.version,
                  }),
                openRuleMenu: () => null,
              }),
              [],
            ]
      },
      ClosedRuleEditor: () => [
        evo(model, {
          editor: () => EditorState.cases.EditorClosed.make({}),
        }),
        [],
      ],
      SavedRule: () => {
        const repository = currentRepository(model)
        if (
          repository === null ||
          (model.editor._tag !== "EditorEditing" &&
            model.editor._tag !== "EditorFailed")
        ) {
          return [model, []]
        }
        const { draft, ruleId, version } = model.editor
        const requestId = model.nextRequestId
        return [
          evo(model, {
            editor: () =>
              EditorState.cases.EditorSaving.make({
                draft,
                requestId,
                ruleId,
                version,
              }),
            nextRequestId: (id) => id + 1,
          }),
          [SaveRule({ repository, requestId, draft, ruleId, version })],
        ]
      },
      RetriedRuleSave: () => retrySave(model),
      ReloadedRuleEditor: () => reloadRuleEditor(model),
      CompletedSaveRule: ({ repository, requestId }) =>
        sameRepository(currentRepository(model), repository) &&
        model.editor._tag === "EditorSaving" &&
        model.editor.requestId === requestId
          ? requestRepository(
              evo(model, {
                editor: () => EditorState.cases.EditorClosed.make({}),
              }),
              repository,
              false,
            )
          : [model, []],
      FailedToSaveRule: ({ conflict, message, repository, requestId }) =>
        sameRepository(currentRepository(model), repository) &&
        model.editor._tag === "EditorSaving" &&
        model.editor.requestId === requestId
          ? failSave(model, repository, message, conflict)
          : [model, []],

      ToggledRuleMenu: ({ ruleId }) => [
        evo(model, {
          openRuleMenu: (open) => (open === ruleId ? null : ruleId),
        }),
        [],
      ],
      ToggledRule: ({ ruleId }) => {
        const repository = currentRepository(model)
        const rule = loadedRule(model, ruleId)
        if (
          repository === null ||
          rule === null ||
          model.rowMutation._tag !== "RowMutationIdle"
        )
          return [model, []]
        const requestId = model.nextRequestId
        const enabled = !rule.enabled
        return [
          evo(model, {
            rowMutation: () =>
              RowMutationState.cases.RowMutationSaving.make({
                ruleId,
                requestId,
                expectedVersion: rule.version,
                enabled,
              }),
            nextRequestId: (id) => id + 1,
          }),
          [
            ToggleRule({
              repository,
              requestId,
              ruleId,
              version: rule.version,
              enabled,
            }),
          ],
        ]
      },
      RetriedToggleRule: () => retryToggle(model),
      DismissedRowMutationError: () =>
        model.rowMutation._tag === "RowMutationFailed" ||
        model.rowMutation._tag === "RowMutationConflict"
          ? [
              evo(model, {
                rowMutation: () =>
                  RowMutationState.cases.RowMutationIdle.make({}),
              }),
              [],
            ]
          : [model, []],
      CompletedToggleRule: ({ repository, requestId }) =>
        sameRepository(currentRepository(model), repository) &&
        model.rowMutation._tag === "RowMutationSaving" &&
        model.rowMutation.requestId === requestId
          ? requestRepository(
              evo(model, {
                rowMutation: () =>
                  RowMutationState.cases.RowMutationIdle.make({}),
              }),
              repository,
              false,
            )
          : [model, []],
      FailedToToggleRule: ({
        conflict,
        message,
        repository,
        requestId,
        ruleId,
      }) =>
        sameRepository(currentRepository(model), repository) &&
        model.rowMutation._tag === "RowMutationSaving" &&
        model.rowMutation.requestId === requestId &&
        model.rowMutation.ruleId === ruleId
          ? failToggle(model, repository, message, conflict)
          : [model, []],

      OpenedDeleteRule: ({ ruleId }) => {
        const rule = loadedRule(model, ruleId)
        return rule === null
          ? [model, []]
          : [
              evo(model, {
                deletion: () =>
                  DeleteState.cases.DeleteConfirming.make({ rule }),
                openRuleMenu: () => null,
              }),
              [],
            ]
      },
      DismissedDeleteRule: () => [
        evo(model, {
          deletion: () => DeleteState.cases.DeleteClosed.make({}),
        }),
        [],
      ],
      ConfirmedDeleteRule: () => {
        const repository = currentRepository(model)
        if (
          repository === null ||
          (model.deletion._tag !== "DeleteConfirming" &&
            model.deletion._tag !== "DeleteFailed") ||
          model.deletion.rule.enabled
        ) {
          return [model, []]
        }
        const rule = model.deletion.rule
        const requestId = model.nextRequestId
        return [
          evo(model, {
            deletion: () =>
              DeleteState.cases.DeleteDeleting.make({ rule, requestId }),
            nextRequestId: (id) => id + 1,
          }),
          [
            DeleteRule({
              repository,
              requestId,
              ruleId: rule.id,
              version: rule.version,
            }),
          ],
        ]
      },
      RetriedDeleteRule: () => retryDelete(model),
      CompletedDeleteRule: ({ repository, requestId }) =>
        sameRepository(currentRepository(model), repository) &&
        model.deletion._tag === "DeleteDeleting" &&
        model.deletion.requestId === requestId
          ? requestRepository(
              evo(model, {
                deletion: () => DeleteState.cases.DeleteClosed.make({}),
              }),
              repository,
              false,
            )
          : [model, []],
      FailedToDeleteRule: ({ conflict, message, repository, requestId }) =>
        sameRepository(currentRepository(model), repository) &&
        model.deletion._tag === "DeleteDeleting" &&
        model.deletion.requestId === requestId
          ? failDelete(model, repository, message, conflict)
          : [model, []],

      OpenedRuleTest: ({ ruleId }) => {
        const repository = currentRepository(model)
        const rule = loadedRule(model, ruleId)
        return repository === null || rule === null
          ? [model, []]
          : [
              evo(model, {
                test: () =>
                  TestState.cases.TestLoadingCandidates.make({ rule }),
                openRuleMenu: () => null,
              }),
              [LoadRuleTestCandidates({ repository, ruleId })],
            ]
      },
      LoadedRuleTestCandidates: ({ candidates, repository, ruleId }) =>
        sameRepository(currentRepository(model), repository) &&
        model.test._tag === "TestLoadingCandidates" &&
        model.test.rule.id === ruleId
          ? configureTest(model, candidates)
          : [model, []],
      FailedToLoadRuleTestCandidates: ({ message, repository, ruleId }) =>
        sameRepository(currentRepository(model), repository) &&
        model.test._tag === "TestLoadingCandidates" &&
        model.test.rule.id === ruleId
          ? failCandidateLoad(model, message)
          : [model, []],
      SelectedRuleTestCandidate: ({ pullRequestNumber }) => {
        if (
          model.test._tag !== "TestConfiguring" &&
          model.test._tag !== "TestFailed"
        ) {
          return [model, []]
        }
        const test = model.test
        return [
          evo(model, {
            test: () =>
              TestState.cases.TestConfiguring.make({
                rule: test.rule,
                candidates: test.candidates,
                selectedPullRequest: pullRequestNumber,
              }),
          }),
          [],
        ]
      },
      RanRuleTest: () => {
        const repository = currentRepository(model)
        if (
          repository === null ||
          (model.test._tag !== "TestConfiguring" &&
            model.test._tag !== "TestFailed") ||
          model.test.selectedPullRequest === null
        ) {
          return [model, []]
        }
        const { candidates, rule, selectedPullRequest } = model.test
        return [
          evo(model, {
            test: () =>
              TestState.cases.TestRunning.make({
                candidates,
                rule,
                selectedPullRequest,
              }),
          }),
          [
            TestRule({
              repository,
              ruleId: rule.id,
              pullRequestNumber: selectedPullRequest,
            }),
          ],
        ]
      },
      CompletedRuleTest: ({ repository, result }) =>
        sameRepository(currentRepository(model), repository) &&
        model.test._tag === "TestRunning"
          ? completeTest(model, result)
          : [model, []],
      FailedRuleTest: ({ message, repository }) =>
        sameRepository(currentRepository(model), repository) &&
        model.test._tag === "TestRunning"
          ? failTest(model, message)
          : [model, []],
      ResetRuleTest: () => {
        if (
          model.test._tag !== "TestResult" &&
          model.test._tag !== "TestFailed"
        ) {
          return [model, []]
        }
        const test = model.test
        return [
          evo(model, {
            test: () =>
              TestState.cases.TestConfiguring.make({
                rule: test.rule,
                candidates: test.candidates,
                selectedPullRequest: test.selectedPullRequest,
              }),
          }),
          [],
        ]
      },
      DismissedRuleTest: () => [
        evo(model, { test: () => TestState.cases.TestClosed.make({}) }),
        [],
      ],

      UpdatedRuleName: ({ name }) => [
        updateDraft(model, (draft) => ({ ...draft, name })),
        [],
      ],
      UpdatedRuleLabel: ({ label }) => [
        updateDraft(model, (draft) => ({ ...draft, label })),
        [],
      ],
      UpdatedRuleConfidence: ({ confidenceThreshold }) => [
        updateDraft(model, (draft) => ({ ...draft, confidenceThreshold })),
        [],
      ],
      UpdatedRuleMode: ({ mode }) => [
        updateDraft(model, (draft) => ({ ...draft, mode })),
        [],
      ],
      UpdatedRuleKind: ({ kind }) => [
        updateDraft(model, (draft) => ({
          ...draft,
          kind,
          mode: kind === "ready-for-review" ? "reconcile" : draft.mode,
        })),
        [],
      ],
      UpdatedRuleExclusiveGroup: ({ exclusiveGroup }) => [
        updateDraft(model, (draft) => ({ ...draft, exclusiveGroup })),
        [],
      ],
      UpdatedRulePrompt: ({ instructions }) => [
        updateDraft(model, (draft) => ({ ...draft, instructions })),
        [],
      ],
    }),
  )

const failSave = (
  model: Model,
  repository: Repository,
  message: string,
  conflict: MutationConflict | null,
): UpdateReturn => {
  if (model.editor._tag !== "EditorSaving") return [model, []]
  const editor = model.editor
  const failed = evo(model, {
    editor: () =>
      conflict === null
        ? EditorState.cases.EditorFailed.make({
            draft: editor.draft,
            ruleId: editor.ruleId,
            version: editor.version,
            message,
          })
        : EditorState.cases.EditorConflict.make({
            draft: editor.draft,
            ruleId: editor.ruleId,
            version: editor.version,
            message,
            conflict,
          }),
  })
  return conflict?._tag === "RepositoryRevisionConflict"
    ? requestRepository(failed, repository, false)
    : [failed, []]
}

const retrySave = (model: Model): UpdateReturn => {
  if (model.editor._tag !== "EditorConflict") return [model, []]
  const repository = currentRepository(model)
  if (repository === null) return [model, []]
  const editor = model.editor
  const serverRule =
    editor.ruleId === null
      ? null
      : latestRule(model, editor.ruleId, editor.conflict)
  if (editor.ruleId !== null && serverRule === null) return [model, []]
  const requestId = model.nextRequestId
  const version = serverRule?.version ?? null
  return [
    evo(model, {
      editor: () =>
        EditorState.cases.EditorSaving.make({
          draft: editor.draft,
          requestId,
          ruleId: editor.ruleId,
          version,
        }),
      nextRequestId: (id) => id + 1,
    }),
    [
      SaveRule({
        repository,
        requestId,
        draft: editor.draft,
        ruleId: editor.ruleId,
        version,
      }),
    ],
  ]
}

const reloadRuleEditor = (model: Model): UpdateReturn => {
  if (model.editor._tag !== "EditorConflict") return [model, []]
  const editor = model.editor
  const serverRule =
    editor.ruleId === null
      ? null
      : latestRule(model, editor.ruleId, editor.conflict)
  if (editor.ruleId !== null && serverRule === null) return [model, []]
  return [
    evo(model, {
      editor: () =>
        EditorState.cases.EditorEditing.make({
          draft: serverRule === null ? editor.draft : draftFromRule(serverRule),
          ruleId: editor.ruleId,
          version: serverRule?.version ?? null,
        }),
    }),
    [],
  ]
}

const failToggle = (
  model: Model,
  repository: Repository,
  message: string,
  conflict: MutationConflict | null,
): UpdateReturn => {
  if (model.rowMutation._tag !== "RowMutationSaving") return [model, []]
  const mutation = model.rowMutation
  const failed = evo(model, {
    rowMutation: () =>
      conflict === null
        ? RowMutationState.cases.RowMutationFailed.make({
            ruleId: mutation.ruleId,
            message,
          })
        : RowMutationState.cases.RowMutationConflict.make({
            ruleId: mutation.ruleId,
            expectedVersion: mutation.expectedVersion,
            enabled: mutation.enabled,
            message,
            conflict,
          }),
  })
  return conflict?._tag === "RepositoryRevisionConflict"
    ? requestRepository(failed, repository, false)
    : [failed, []]
}

const retryToggle = (model: Model): UpdateReturn => {
  if (model.rowMutation._tag !== "RowMutationConflict") return [model, []]
  const repository = currentRepository(model)
  const mutation = model.rowMutation
  const currentRule = latestRule(model, mutation.ruleId, mutation.conflict)
  if (repository === null || currentRule === null) return [model, []]
  const requestId = model.nextRequestId
  return [
    evo(model, {
      rowMutation: () =>
        RowMutationState.cases.RowMutationSaving.make({
          ruleId: mutation.ruleId,
          requestId,
          expectedVersion: currentRule.version,
          enabled: mutation.enabled,
        }),
      nextRequestId: (id) => id + 1,
    }),
    [
      ToggleRule({
        repository,
        requestId,
        ruleId: mutation.ruleId,
        version: currentRule.version,
        enabled: mutation.enabled,
      }),
    ],
  ]
}

const failDelete = (
  model: Model,
  repository: Repository,
  message: string,
  conflict: MutationConflict | null,
): UpdateReturn => {
  if (model.deletion._tag !== "DeleteDeleting") return [model, []]
  const rule = model.deletion.rule
  const failed = evo(model, {
    deletion: () =>
      conflict === null
        ? DeleteState.cases.DeleteFailed.make({ rule, message })
        : DeleteState.cases.DeleteConflict.make({ rule, message, conflict }),
  })
  return conflict?._tag === "RepositoryRevisionConflict"
    ? requestRepository(failed, repository, false)
    : [failed, []]
}

const retryDelete = (model: Model): UpdateReturn => {
  if (model.deletion._tag !== "DeleteConflict") return [model, []]
  const repository = currentRepository(model)
  const deletion = model.deletion
  const currentRule = latestRule(model, deletion.rule.id, deletion.conflict)
  if (repository === null || currentRule === null || currentRule.enabled)
    return [model, []]
  const requestId = model.nextRequestId
  return [
    evo(model, {
      deletion: () =>
        DeleteState.cases.DeleteDeleting.make({
          rule: currentRule,
          requestId,
        }),
      nextRequestId: (id) => id + 1,
    }),
    [
      DeleteRule({
        repository,
        requestId,
        ruleId: currentRule.id,
        version: currentRule.version,
      }),
    ],
  ]
}

const configureTest = (
  model: Model,
  candidates: Extract<Model["test"], { _tag: "TestConfiguring" }>["candidates"],
): UpdateReturn => {
  if (model.test._tag !== "TestLoadingCandidates") return [model, []]
  const rule = model.test.rule
  return [
    evo(model, {
      test: () =>
        TestState.cases.TestConfiguring.make({
          rule,
          candidates,
          selectedPullRequest: candidates[0]?.number ?? null,
        }),
    }),
    [],
  ]
}

const failCandidateLoad = (model: Model, message: string): UpdateReturn => {
  if (model.test._tag !== "TestLoadingCandidates") return [model, []]
  const rule = model.test.rule
  return [
    evo(model, {
      test: () =>
        TestState.cases.TestFailed.make({
          rule,
          candidates: [],
          selectedPullRequest: null,
          message,
        }),
    }),
    [],
  ]
}

const completeTest = (
  model: Model,
  result: Extract<Model["test"], { _tag: "TestResult" }>["result"],
): UpdateReturn => {
  if (model.test._tag !== "TestRunning") return [model, []]
  const test = model.test
  return [
    evo(model, {
      test: () =>
        TestState.cases.TestResult.make({
          rule: test.rule,
          candidates: test.candidates,
          selectedPullRequest: test.selectedPullRequest,
          result,
        }),
    }),
    [],
  ]
}

const failTest = (model: Model, message: string): UpdateReturn => {
  if (model.test._tag !== "TestRunning") return [model, []]
  const test = model.test
  return [
    evo(model, {
      test: () =>
        TestState.cases.TestFailed.make({
          rule: test.rule,
          candidates: test.candidates,
          selectedPullRequest: test.selectedPullRequest,
          message,
        }),
    }),
    [],
  ]
}

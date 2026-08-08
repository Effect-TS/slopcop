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
  }
}

const refresh = (repository: Repository): ReadonlyArray<Command> => [
  LoadRepositoryData({ repository }),
]

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
                openRuleMenu: () => null,
              }),
              [],
            ]
          : [
              evo(model, {
                repository: () =>
                  RepositoryState.cases.LoadingRepository.make({ repository }),
                editor: () => EditorState.cases.EditorClosed.make({}),
                deletion: () => DeleteState.cases.DeleteClosed.make({}),
                test: () => TestState.cases.TestClosed.make({}),
                rowMutation: () =>
                  RowMutationState.cases.RowMutationIdle.make({}),
                openRuleMenu: () => null,
              }),
              refresh(repository),
            ],
      RetriedRepositoryLoad: () => {
        const repository = currentRepository(model)
        return repository === null
          ? [model, []]
          : [
              evo(model, {
                repository: () =>
                  RepositoryState.cases.LoadingRepository.make({ repository }),
              }),
              refresh(repository),
            ]
      },
      LoadedRepositoryData: ({
        activity,
        labels,
        repository,
        revision,
        rules,
      }) =>
        sameRepository(currentRepository(model), repository)
          ? [
              evo(model, {
                repository: () =>
                  RepositoryState.cases.LoadedRepository.make({
                    data: { repository, revision, rules, activity, labels },
                  }),
              }),
              [],
            ]
          : [model, []],
      FailedToLoadRepositoryData: ({ message, repository }) =>
        sameRepository(currentRepository(model), repository)
          ? [
              evo(model, {
                repository: () =>
                  RepositoryState.cases.FailedRepository.make({
                    repository,
                    message,
                  }),
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
        return [
          evo(model, {
            editor: () =>
              EditorState.cases.EditorSaving.make({ draft, ruleId, version }),
          }),
          [SaveRule({ repository, draft, ruleId, version })],
        ]
      },
      CompletedSaveRule: ({ repository }) =>
        sameRepository(currentRepository(model), repository)
          ? [
              evo(model, {
                editor: () => EditorState.cases.EditorClosed.make({}),
              }),
              refresh(repository),
            ]
          : [model, []],
      FailedToSaveRule: ({ currentRule, message, repository }) =>
        sameRepository(currentRepository(model), repository) &&
        model.editor._tag === "EditorSaving"
          ? failSave(model, message, currentRule)
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
        return repository === null || rule === null
          ? [model, []]
          : [
              evo(model, {
                rowMutation: () =>
                  RowMutationState.cases.RowMutationSaving.make({ ruleId }),
              }),
              [
                ToggleRule({
                  repository,
                  ruleId,
                  version: rule.version,
                  enabled: !rule.enabled,
                }),
              ],
            ]
      },
      CompletedToggleRule: ({ repository }) =>
        sameRepository(currentRepository(model), repository)
          ? [
              evo(model, {
                rowMutation: () =>
                  RowMutationState.cases.RowMutationIdle.make({}),
              }),
              refresh(repository),
            ]
          : [model, []],
      FailedToToggleRule: ({ message, repository, ruleId }) =>
        sameRepository(currentRepository(model), repository)
          ? [
              evo(model, {
                rowMutation: () =>
                  RowMutationState.cases.RowMutationFailed.make({
                    ruleId,
                    message,
                  }),
              }),
              [],
            ]
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
        return [
          evo(model, {
            deletion: () => DeleteState.cases.DeleteDeleting.make({ rule }),
          }),
          [
            DeleteRule({
              repository,
              ruleId: rule.id,
              version: rule.version,
            }),
          ],
        ]
      },
      CompletedDeleteRule: ({ repository }) =>
        sameRepository(currentRepository(model), repository)
          ? [
              evo(model, {
                deletion: () => DeleteState.cases.DeleteClosed.make({}),
              }),
              refresh(repository),
            ]
          : [model, []],
      FailedToDeleteRule: ({ message, repository }) =>
        sameRepository(currentRepository(model), repository) &&
        model.deletion._tag === "DeleteDeleting"
          ? failDelete(model, message)
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
  message: string,
  currentRule: Extract<
    Model["editor"],
    { _tag: "EditorFailed" }
  >["currentRule"],
): UpdateReturn => {
  if (model.editor._tag !== "EditorSaving") return [model, []]
  const editor = model.editor
  return [
    evo(model, {
      editor: () =>
        EditorState.cases.EditorFailed.make({
          draft: editor.draft,
          ruleId: editor.ruleId,
          version: editor.version,
          message,
          currentRule,
        }),
    }),
    [],
  ]
}

const failDelete = (model: Model, message: string): UpdateReturn => {
  if (model.deletion._tag !== "DeleteDeleting") return [model, []]
  const rule = model.deletion.rule
  return [
    evo(model, {
      deletion: () => DeleteState.cases.DeleteFailed.make({ rule, message }),
    }),
    [],
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

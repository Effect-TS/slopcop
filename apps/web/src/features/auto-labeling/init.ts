import type { Model } from "./model"

export const init = (): Model => ({
  editingRule: null,
  testingRule: null,
  deletingRule: null,
  openRuleMenu: null,
  documentationEnabled: true,
  bugEnabled: true,
  dependenciesEnabled: false,
  documentationLabel: "documentation",
  bugLabel: "bug",
  dependenciesLabel: "dependencies",
  documentationConfidence: 80,
  bugConfidence: 75,
  dependenciesConfidence: 95,
  documentationMode: "add-only",
  bugMode: "reconcile",
  dependenciesMode: "add-only",
  documentationKind: "ai",
  bugKind: "ai",
  dependenciesKind: "ai",
  documentationExclusiveGroup: "change-area",
  bugExclusiveGroup: "change-kind",
  dependenciesExclusiveGroup: "change-kind",
  ruleTestStage: "Closed",
  documentationPrompt:
    "Apply this label when the pull request primarily improves guides, API references, examples, or other user-facing documentation. Include code changes only when they exist to support the documentation update.",
  bugPrompt:
    "Apply this label when the change fixes incorrect or unexpected behavior. Look for a clear description of the previous behavior, the expected behavior, or a regression being corrected.",
  dependenciesPrompt:
    "Apply this label when the pull request updates, replaces, or removes project dependencies or lockfiles. Do not apply it when dependency changes are incidental to a larger feature.",
})

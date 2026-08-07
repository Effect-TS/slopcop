import * as Match from "effect/Match"
import { evo } from "foldkit/struct"
import type { Message } from "./message"
import type { Model } from "./model"

export type UpdateReturn = readonly [Model, readonly []]

export const update = (model: Model, message: Message): UpdateReturn =>
  Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tagsExhaustive({
      ClosedRuleEditor: () => [evo(model, { editingRule: () => null }), []],
      ConfirmedDeleteRule: () => [evo(model, { deletingRule: () => null }), []],
      DismissedDeleteRule: () => [evo(model, { deletingRule: () => null }), []],
      DismissedRuleTest: () => [
        evo(model, {
          testingRule: () => null,
          ruleTestStage: () => "Closed",
        }),
        [],
      ],
      OpenedDeleteRule: ({ ruleId }) => [
        evo(model, {
          deletingRule: () => ruleId,
          openRuleMenu: () => null,
        }),
        [],
      ],
      OpenedRuleEditor: ({ ruleId }) => [
        evo(model, {
          editingRule: () => ruleId,
          openRuleMenu: () => null,
        }),
        [],
      ],
      OpenedRuleTest: ({ ruleId }) => [
        evo(model, {
          testingRule: () => ruleId,
          ruleTestStage: () => "Configure",
          openRuleMenu: () => null,
        }),
        [],
      ],
      RanRuleTest: () => [evo(model, { ruleTestStage: () => "Result" }), []],
      ResetRuleTest: () => [
        evo(model, { ruleTestStage: () => "Configure" }),
        [],
      ],
      ToggledRule: ({ ruleId }) => {
        switch (ruleId) {
          case "Documentation":
            return [
              evo(model, {
                documentationEnabled: (enabled) => !enabled,
              }),
              [],
            ]
          case "Bug":
            return [evo(model, { bugEnabled: (enabled) => !enabled }), []]
          case "Dependencies":
            return [
              evo(model, {
                dependenciesEnabled: (enabled) => !enabled,
              }),
              [],
            ]
        }
      },
      ToggledRuleMenu: ({ ruleId }) => [
        evo(model, {
          openRuleMenu: (openRuleMenu) =>
            openRuleMenu === ruleId ? null : ruleId,
        }),
        [],
      ],
      UpdatedRuleConfidence: ({ confidence, ruleId }) => {
        switch (ruleId) {
          case "Documentation":
            return [
              evo(model, { documentationConfidence: () => confidence }),
              [],
            ]
          case "Bug":
            return [evo(model, { bugConfidence: () => confidence }), []]
          case "Dependencies":
            return [
              evo(model, { dependenciesConfidence: () => confidence }),
              [],
            ]
        }
      },
      UpdatedRuleLabel: ({ label, ruleId }) => {
        switch (ruleId) {
          case "Documentation":
            return [evo(model, { documentationLabel: () => label }), []]
          case "Bug":
            return [evo(model, { bugLabel: () => label }), []]
          case "Dependencies":
            return [evo(model, { dependenciesLabel: () => label }), []]
        }
      },
      UpdatedRuleMode: ({ mode, ruleId }) => {
        switch (ruleId) {
          case "Documentation":
            return [evo(model, { documentationMode: () => mode }), []]
          case "Bug":
            return [evo(model, { bugMode: () => mode }), []]
          case "Dependencies":
            return [evo(model, { dependenciesMode: () => mode }), []]
        }
      },
      UpdatedRuleKind: ({ kind, ruleId }) => {
        switch (ruleId) {
          case "Documentation":
            return [
              evo(model, {
                documentationKind: () => kind,
                documentationMode: (mode) =>
                  kind === "ready-for-review" ? "reconcile" : mode,
              }),
              [],
            ]
          case "Bug":
            return [
              evo(model, {
                bugKind: () => kind,
                bugMode: (mode) =>
                  kind === "ready-for-review" ? "reconcile" : mode,
              }),
              [],
            ]
          case "Dependencies":
            return [
              evo(model, {
                dependenciesKind: () => kind,
                dependenciesMode: (mode) =>
                  kind === "ready-for-review" ? "reconcile" : mode,
              }),
              [],
            ]
        }
      },
      UpdatedRuleExclusiveGroup: ({ exclusiveGroup, ruleId }) => {
        switch (ruleId) {
          case "Documentation":
            return [
              evo(model, { documentationExclusiveGroup: () => exclusiveGroup }),
              [],
            ]
          case "Bug":
            return [evo(model, { bugExclusiveGroup: () => exclusiveGroup }), []]
          case "Dependencies":
            return [
              evo(model, { dependenciesExclusiveGroup: () => exclusiveGroup }),
              [],
            ]
        }
      },
      UpdatedRulePrompt: ({ prompt, ruleId }) => {
        switch (ruleId) {
          case "Documentation":
            return [evo(model, { documentationPrompt: () => prompt }), []]
          case "Bug":
            return [evo(model, { bugPrompt: () => prompt }), []]
          case "Dependencies":
            return [evo(model, { dependenciesPrompt: () => prompt }), []]
        }
      },
    }),
  )

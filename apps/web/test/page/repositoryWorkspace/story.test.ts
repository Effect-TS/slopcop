import * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import { Schema as S } from "effect"
import { Story } from "foldkit"
import { describe, expect, test } from "vite-plus/test"

import {
  CreateRule,
  DeleteRule,
  LoadAuditHistory,
  UpdateRule,
} from "../../../src/page/repositoryWorkspace/command.ts"
import {
  ChangedDraftInstructions,
  ChangedAuditOperation,
  ClickedCreateRule,
  ClickedEditRule,
  ConfirmedRuleDeletion,
  CreatedRule,
  DeletedRule,
  FailedRuleOperation,
  LoadedAuditHistory,
  OpenedAuditHistory,
  RequestedRuleDeletion,
  SubmittedRule,
} from "../../../src/page/repositoryWorkspace/message.ts"
import {
  AuditClosed,
  EditorClosed,
  NoRuleNotice,
  WorkspaceReady,
} from "../../../src/page/repositoryWorkspace/model.ts"
import { update } from "../../../src/page/repositoryWorkspace/update.ts"

const ruleJson = {
  id: "rule-1",
  label: "bug",
  instructions: "The pull request fixes a defect.",
  mode: "add-only",
  exclusiveGroup: null,
  enabled: false,
  validationStatus: "valid",
  validatedAt: "2026-07-27T00:00:00.000Z",
  version: 1,
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
} as const

const rule = S.decodeUnknownSync(LabelingRuleManagement.PublicLabelingRule)(
  ruleJson,
)

const latestRule = S.decodeUnknownSync(
  LabelingRuleManagement.PublicLabelingRule,
)({
  ...ruleJson,
  instructions: "The server changed these instructions.",
  version: 2,
  updatedAt: "2026-07-27T01:00:00.000Z",
})

const createdRule = { ...rule, enabled: true }

const auditEntry = S.decodeUnknownSync(
  LabelingRuleManagement.PublicLabelingRuleAuditEntry,
)({
  id: "audit-1",
  ruleId: "rule-1",
  actor: "admin:cloudflare-access:max@example.com",
  operation: "disable",
  before: {
    id: "rule-1",
    label: "bug",
    instructions: "The pull request fixes a defect.",
    mode: "add-only",
    exclusiveGroup: null,
    enabled: true,
    validationStatus: "valid",
    validatedAt: "2026-07-27T00:00:00.000Z",
    version: 1,
  },
  after: {
    id: "rule-1",
    label: "bug",
    instructions: "The pull request fixes a defect.",
    mode: "add-only",
    exclusiveGroup: null,
    enabled: false,
    validationStatus: "valid",
    validatedAt: "2026-07-27T00:00:00.000Z",
    version: 2,
  },
  createdAt: "2026-07-27T01:00:00.000Z",
})

const model = WorkspaceReady.make({
  repository: { owner: "Effect-TS", repo: "effect" },
  generation: 1,
  revision: 1,
  rules: [rule],
  labels: [{ name: "bug", description: "A defect", color: "d73a4a" }],
  query: "",
  statusFilter: "all",
  editor: EditorClosed.make({}),
  pending: null,
  deletingRuleId: null,
  notice: NoRuleNotice.make({}),
  audit: AuditClosed.make({}),
  auditSequence: 0,
})

describe("repository workspace update", () => {
  test("creates an active add-only rule from the editor", () => {
    Story.story(
      update,
      Story.with(WorkspaceReady.make({ ...model, rules: [] })),
      Story.message(ClickedCreateRule()),
      Story.message(
        ChangedDraftInstructions({
          instructions: "The pull request fixes a defect.",
        }),
      ),
      Story.message(SubmittedRule()),
      Story.Command.expectHas(CreateRule),
      Story.Command.resolve(
        CreateRule,
        CreatedRule({
          owner: "Effect-TS",
          repo: "effect",
          generation: 1,
          rule: createdRule,
        }),
      ),
      Story.model((model) => {
        expect(model._tag).toBe("Ready")
        if (model._tag === "Ready") {
          expect(model.rules[0]?.enabled).toBe(true)
        }
      }),
    )
  })

  test("preserves a draft and loads the latest rule after a conflict", () => {
    Story.story(
      update,
      Story.with(model),
      Story.message(ClickedEditRule({ ruleId: rule.id })),
      Story.message(
        ChangedDraftInstructions({ instructions: "My unsaved instructions." }),
      ),
      Story.message(SubmittedRule()),
      Story.Command.expectHas(UpdateRule),
      Story.Command.resolve(
        UpdateRule,
        FailedRuleOperation({
          owner: "Effect-TS",
          repo: "effect",
          generation: 1,
          operation: "update",
          ruleId: rule.id,
          message: "The rule changed after it was loaded.",
          currentRule: latestRule,
        }),
      ),
      Story.model((model) => {
        expect(model._tag).toBe("Ready")
        if (model._tag === "Ready" && model.editor._tag === "Editing") {
          expect(model.editor.draft.instructions).toBe(
            "My unsaved instructions.",
          )
          expect(model.editor.version).toBe(2)
          expect(model.editor.conflict?.version).toBe(2)
          expect(model.rules[0]?.instructions).toBe(
            "The server changed these instructions.",
          )
        }
      }),
    )
  })

  test("requires confirmation before deleting a disabled rule", () => {
    Story.story(
      update,
      Story.with(model),
      Story.message(RequestedRuleDeletion({ ruleId: rule.id })),
      Story.Command.expectNone(),
      Story.message(ConfirmedRuleDeletion()),
      Story.Command.expectHas(DeleteRule),
      Story.Command.resolve(
        DeleteRule,
        DeletedRule({
          owner: "Effect-TS",
          repo: "effect",
          generation: 1,
          ruleId: rule.id,
        }),
      ),
      Story.model((model) => {
        expect(model._tag).toBe("Ready")
        if (model._tag === "Ready") expect(model.rules).toHaveLength(0)
      }),
    )
  })

  test("ignores mutation results from an older workspace generation", () => {
    const current = WorkspaceReady.make({
      ...model,
      generation: 2,
      pending: { operation: "create", ruleId: null },
    })
    const [next] = update(
      current,
      CreatedRule({
        owner: "Effect-TS",
        repo: "effect",
        generation: 1,
        rule: createdRule,
      }),
    )

    expect(next).toBe(current)
  })

  test("loads audit history independently from the rule workspace", () => {
    Story.story(
      update,
      Story.with(model),
      Story.message(OpenedAuditHistory()),
      Story.Command.expectHas(LoadAuditHistory),
      Story.Command.resolve(
        LoadAuditHistory,
        LoadedAuditHistory({
          owner: "Effect-TS",
          repo: "effect",
          generation: 1,
          requestId: 1,
          ruleId: null,
          operation: "all",
          cursor: null,
          entries: [auditEntry],
          nextCursor: null,
        }),
      ),
      Story.model((model) => {
        expect(model._tag).toBe("Ready")
        if (model._tag === "Ready") {
          expect(model.audit._tag).toBe("AuditReady")
          if (model.audit._tag === "AuditReady") {
            expect(model.audit.entries[0]?.operation).toBe("disable")
          }
        }
      }),
    )
  })

  test("ignores audit results for an outdated filter", () => {
    const [loading] = update(model, OpenedAuditHistory())
    const [filtered] = update(
      loading,
      ChangedAuditOperation({ operation: "delete" }),
    )
    const [afterStaleResult] = update(
      filtered,
      LoadedAuditHistory({
        owner: "Effect-TS",
        repo: "effect",
        generation: 1,
        requestId: 1,
        ruleId: null,
        operation: "all",
        cursor: null,
        entries: [auditEntry],
        nextCursor: null,
      }),
    )

    expect(afterStaleResult).toBe(filtered)
  })
})

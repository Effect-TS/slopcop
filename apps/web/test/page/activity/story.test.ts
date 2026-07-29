import * as LabelingRuleManagement from "@slopcop/domain/Labeling/LabelingRuleManagement"
import { Schema as S } from "effect"
import { Story } from "foldkit"
import { describe, expect, test } from "vite-plus/test"
import { LoadActivity } from "../../../src/page/activity/command.ts"
import {
  ChangedRoute,
  LoadedActivity,
} from "../../../src/page/activity/message.ts"
import { ActivityNotAsked, Model } from "../../../src/page/activity/model.ts"
import { update } from "../../../src/page/activity/update.ts"

const entry = S.decodeUnknownSync(
  LabelingRuleManagement.PublicLabelingRuleActivityEntry,
)({
  repository: { owner: "Effect-TS", repo: "effect" },
  id: "audit-1",
  ruleId: "rule-1",
  actor: "admin:cloudflare-access:max@example.com",
  operation: "disable",
  before: null,
  after: {
    id: "rule-1",
    label: "bug",
    instructions: "A defect was fixed.",
    mode: "add-only",
    exclusiveGroup: null,
    enabled: false,
    validationStatus: "valid",
    validatedAt: "2026-07-28T00:00:00.000Z",
    version: 2,
  },
  createdAt: "2026-07-28T01:00:00.000Z",
})

describe("activity update", () => {
  test("loads global label-rule activity when the route opens", () => {
    const model = Model.make({
      repository: null,
      operation: "all",
      requestId: 0,
      repositories: [],
      loadMoreError: null,
      activity: ActivityNotAsked.make({}),
    })

    Story.story(
      update,
      Story.with(model),
      Story.message(ChangedRoute()),
      Story.Command.expectHas(LoadActivity),
      Story.Command.resolve(
        LoadActivity,
        LoadedActivity({
          requestId: 1,
          repository: null,
          operation: "all",
          cursor: null,
          entries: [entry],
          repositories: [{ owner: "Effect-TS", repo: "effect" }],
          nextCursor: null,
        }),
      ),
      Story.model((model) => {
        expect(model.activity._tag).toBe("Ready")
        if (model.activity._tag === "Ready") {
          expect(model.activity.entries[0]?.repository.repo).toBe("effect")
        }
      }),
    )
  })
})

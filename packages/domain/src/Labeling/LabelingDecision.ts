import { Schema } from "effect"
import { Model } from "effect/unstable/schema"
import { GitHubEventId } from "../GitHub/GitHubEvent.ts"
import * as GitHubLabel from "../GitHub/GitHubLabel.ts"
import { GitHubRepositoryId } from "../GitHub/GitHubRepository.ts"
import { LabelingRuleId } from "./LabelingRule.ts"

export const LabelingDecisionId = Schema.String.pipe(
  Schema.brand("LabelingDecisionId"),
)

export const LabelingSubjectType = Schema.Literals(["pull_request", "issue"])

const SelectedRuleIdsField = Model.JsonFromString(Schema.Array(LabelingRuleId))

const LabelsField = Model.JsonFromString(
  Schema.Array(GitHubLabel.GitHubLabelName),
)

export class LabelingDecision extends Model.Class<LabelingDecision>(
  "LabelingDecision",
)({
  id: Model.UuidV7Insert(LabelingDecisionId),
  deliveryId: Model.GeneratedByApp(GitHubEventId),
  repositoryId: Model.GeneratedByApp(GitHubRepositoryId),
  subjectType: Model.GeneratedByApp(LabelingSubjectType),
  subjectNumber: Model.GeneratedByApp(Schema.Int),
  headSha: Model.GeneratedByApp(Schema.NullOr(Schema.String)),
  rulesRevision: Model.GeneratedByApp(Schema.Int),
  selectedRuleIds: SelectedRuleIdsField,
  selectedLabels: LabelsField,
  model: Model.GeneratedByApp(Schema.String),
  promptVersion: Model.GeneratedByApp(Schema.String),
  labelsAdded: LabelsField,
  labelsRemoved: LabelsField,
  createdAt: Model.DateTimeInsertFromNumber,
}) {}

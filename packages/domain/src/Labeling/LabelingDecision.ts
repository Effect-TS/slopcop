import { Schema } from "effect"
import { Model } from "effect/unstable/schema"
import { GitHubWebhookDeliveryId } from "../GitHub/GitHubWebhookDelivery.ts"
import * as GitHubLabel from "../GitHub/GitHubLabel.ts"
import { GitHubRepositoryId } from "../GitHub/GitHubRepository.ts"
import { LabelingRuleId } from "./LabelingRule.ts"
export const LabelingDecisionId = Schema.String.pipe(
  Schema.brand("LabelingDecisionId"),
)
export const LabelingSubjectType = Schema.Literals(["pull_request", "issue"])
const RuleIds = Model.JsonFromString(Schema.Array(LabelingRuleId))
const Labels = Model.JsonFromString(Schema.Array(GitHubLabel.GitHubLabelName))
export class LabelingDecision extends Model.Class<LabelingDecision>(
  "LabelingDecision",
)({
  id: Model.UuidV7Insert(LabelingDecisionId),
  deliveryId: Model.GeneratedByApp(GitHubWebhookDeliveryId),
  repositoryId: Model.GeneratedByApp(GitHubRepositoryId),
  subjectType: Model.GeneratedByApp(LabelingSubjectType),
  subjectNumber: Model.GeneratedByApp(Schema.Int),
  headSha: Model.GeneratedByApp(Schema.NullOr(Schema.String)),
  rulesRevision: Model.GeneratedByApp(Schema.Int),
  selectedRuleIds: RuleIds,
  selectedLabels: Labels,
  model: Model.GeneratedByApp(Schema.String),
  promptVersion: Model.GeneratedByApp(Schema.String),
  labelsAdded: Labels,
  labelsRemoved: Labels,
  createdAt: Model.DateTimeInsertFromNumber,
}) {}

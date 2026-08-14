import * as Setup from "@slopcop/domain/GitHub/Setup"
import * as Schema from "effect/Schema"
import { m } from "foldkit/message"
import { Toast } from "./toast"

export const RequestedSync = m("RequestedSync")
export const AcceptedSync = m("AcceptedSync", {
  previousAttemptAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  previousSuccessAt: Schema.NullOr(Schema.DateTimeUtcFromString),
})
export const LoadedSyncStatus = m("LoadedSyncStatus", {
  status: Setup.GitHubDataSyncStatus,
})
export const FailedSync = m("FailedSync", { message: Schema.String })
export const GotToastMessage = m("GotToastMessage", { message: Toast.Message })

export const Message = Schema.Union([
  RequestedSync,
  AcceptedSync,
  LoadedSyncStatus,
  FailedSync,
  GotToastMessage,
])
export type Message = typeof Message.Type

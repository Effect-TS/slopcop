import * as Setup from "@slopcop/domain/GitHub/Setup"
import * as Schema from "effect/Schema"
import { m } from "foldkit/message"

export const RequestedSetupRefresh = m("RequestedSetupRefresh")
export type RequestedSetupRefresh = typeof RequestedSetupRefresh.Type

export const LoadedSetup = m("LoadedSetup", {
  setup: Setup.SetupStatus,
})
export type LoadedSetup = typeof LoadedSetup.Type

export const FailedToLoadSetup = m("FailedToLoadSetup", {
  message: Schema.NonEmptyString,
})
export type FailedToLoadSetup = typeof FailedToLoadSetup.Type

export const Message = Schema.Union([
  RequestedSetupRefresh,
  LoadedSetup,
  FailedToLoadSetup,
])
export type Message = typeof Message.Type

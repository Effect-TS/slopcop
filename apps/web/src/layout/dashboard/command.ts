import { Effect } from "effect"
import { Command } from "foldkit"
import { load } from "foldkit/navigation"

import { CompletedLoadExternal } from "./message"

export const LoadAccessLogout = Command.define(
  "LoadAccessLogout",
  CompletedLoadExternal,
)(load("/cdn-cgi/access/logout").pipe(Effect.as(CompletedLoadExternal())))

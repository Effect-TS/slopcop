import { Effect, Match as M, Schema as S } from "effect"
import { Command } from "foldkit"
import { load, pushUrl } from "foldkit/navigation"
import { evo } from "foldkit/struct"
import { toString as urlToString } from "foldkit/url"

import {
  CompletedLoadExternal,
  CompletedNavigateInternal,
  type Message,
} from "./message"
import type { Model } from "./model"
import { urlToAppRoute } from "./route"

const NavigateInternal = Command.define(
  "NavigateInternal",
  { url: S.String },
  CompletedNavigateInternal,
)(({ url }) => pushUrl(url).pipe(Effect.as(CompletedNavigateInternal())))

export const LoadAccessLogout = Command.define(
  "LoadAccessLogout",
  CompletedLoadExternal,
)(load("/cdn-cgi/access/logout").pipe(Effect.as(CompletedLoadExternal())))

const LoadExternal = Command.define(
  "LoadExternal",
  { href: S.String },
  CompletedLoadExternal,
)(({ href }) => load(href).pipe(Effect.as(CompletedLoadExternal())))

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]
const withUpdateReturn = M.withReturnType<UpdateReturn>()

export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      ChangedUrl: ({ url }) => [
        evo(model, { route: () => urlToAppRoute(url) }),
        [],
      ],
      ClickedLink: ({ request }) =>
        M.value(request).pipe(
          withUpdateReturn,
          M.tagsExhaustive({
            Internal: ({ url }) => [
              model,
              [NavigateInternal({ url: urlToString(url) })],
            ],
            External: ({ href }) => [model, [LoadExternal({ href })]],
          }),
        ),
      ClickedLogout: () => [model, [LoadAccessLogout()]],
      CompletedNavigateInternal: () => [model, []],
      CompletedLoadExternal: () => [model, []],
    }),
  )

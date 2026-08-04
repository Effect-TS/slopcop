import * as Effect from "effect/Effect"
import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore"
import * as Layer from "effect/Layer"
import * as Runtime from "foldkit/runtime"

import { overlay } from "@foldkit/devtools"

import {
  type AppResources,
  Flags,
  Message,
  Model,
  init,
  flags,
  subscriptions,
  update,
  view,
} from "./main"
import { ApiClient } from "./api-client"

const AppLayer = Layer.mergeAll(
  BrowserKeyValueStore.layerLocalStorage,
  ApiClient.layer,
)

const application = Runtime.makeApplication<
  Model,
  Message,
  Flags,
  AppResources
>({
  Model,
  Flags,
  flags: Effect.provide(flags, AppLayer),
  init,
  update,
  view,
  subscriptions,
  resources: AppLayer,
  container: document.getElementById("root"),
  devTools: {
    overlay,
    Message,
  },
})

Runtime.run(application)

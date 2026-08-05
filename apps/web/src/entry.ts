import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore"
import { overlay } from "@foldkit/devtools"
import * as Layer from "effect/Layer"
import * as Runtime from "foldkit/runtime"
import { ApiClient } from "./api-client"
import * as Main from "./main"

const AppLayer = Layer.mergeAll(
  BrowserKeyValueStore.layerLocalStorage,
  ApiClient.layer,
)

const application = Runtime.makeApplication<
  Main.Model,
  Main.Message,
  Main.Flags,
  Main.AppResources
>({
  Model: Main.Model,
  Flags: Main.Flags,
  flags: Main.flags,
  init: Main.init,
  update: Main.update,
  view: Main.view,
  subscriptions: Main.subscriptions,
  resources: AppLayer,
  container: document.getElementById("root"),
  devTools: { overlay, Message: Main.Message },
  routing: {
    onUrlRequest: (request) => Main.ClickedLink({ request }),
    onUrlChange: (url) => Main.ChangedUrl({ url }),
  },
})

Runtime.run(application)

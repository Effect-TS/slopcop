import { Toast } from "./toast"
import { Model } from "./model"

export const init = (): Model =>
  Model.make({
    state: "idle",
    previousAttemptAt: null,
    previousSuccessAt: null,
    toast: Toast.init({ id: "github-sync-toast" }),
  })

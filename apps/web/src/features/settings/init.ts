import { SaveState, type Model } from "./model"

export const init = (): Model => ({
  repository: null,
  enabled: false,
  saveState: SaveState.cases.SaveIdle.make({}),
  nextRequestId: 1,
})

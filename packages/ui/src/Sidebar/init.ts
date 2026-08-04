import * as Dialog from "@foldkit/ui/dialog"
import type { Mode, Model } from "./model.ts"

export type InitConfig = Readonly<{
  id: string
  mode?: Mode
}>

export const init = (config: InitConfig): Model => ({
  mode: config.mode ?? "Desktop",
  desktopState: "Expanded",
  dialog: Dialog.init({
    id: config.id,
    isAnimated: true,
  }),
})

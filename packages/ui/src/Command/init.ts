import { Option } from "effect"
import type { Model } from "./model.ts"

export type InitConfig = Readonly<{
  id: string
  initialQuery?: string
  loop?: boolean
  vimBindings?: boolean
}>

export const init = (config: InitConfig): Model => ({
  id: config.id,
  query: config.initialQuery ?? "",
  maybeActiveValue: Option.none(),
  activationTrigger: "Keyboard",
  maybeLastPointerPosition: Option.none(),
  loop: config.loop ?? false,
  vimBindings: config.vimBindings ?? true,
})

import * as Menu from "@foldkit/ui/menu"
import { type Command, ApplyTheme } from "./command"
import type { Flags } from "./flags"
import { resolveTheme, Model } from "./model"

export const init = (
  flags: Flags,
): readonly [Model, ReadonlyArray<Command>] => {
  const menu = Menu.init({ id: "theme-menu" })

  const resolvedTheme = resolveTheme(flags)

  return [
    Model.make({
      ...flags,
      menu,
      resolvedTheme,
    }),
    [ApplyTheme({ theme: resolvedTheme })],
  ]
}

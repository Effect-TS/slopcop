import * as Story from "foldkit/story"
import { describe, expect, it } from "vite-plus/test"

import {
  ChangedSystemTheme,
  init,
  update,
} from "../../../src/features/theme.ts"

describe("Theme update", () => {
  it("follows system appearance when the preference is System", () => {
    Story.story(
      update,
      Story.given(
        init({
          preferredTheme: "System",
          systemTheme: "Dark",
        })[0],
      ),
      Story.message(ChangedSystemTheme({ theme: "Light" })),
      Story.model((model) => {
        expect(model.systemTheme).toBe("Light")
        expect(model.resolvedTheme).toBe("Light")
      }),
      Story.Command.expectNone(),
    )
  })

  it("tracks system appearance without overriding an explicit preference", () => {
    Story.story(
      update,
      Story.given(
        init({
          preferredTheme: "Dark",
          systemTheme: "Dark",
        })[0],
      ),
      Story.message(ChangedSystemTheme({ theme: "Light" })),
      Story.model((model) => {
        expect(model.systemTheme).toBe("Light")
        expect(model.resolvedTheme).toBe("Dark")
      }),
      Story.Command.expectNone(),
    )
  })
})

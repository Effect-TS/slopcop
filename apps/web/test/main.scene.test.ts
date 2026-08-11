import * as Option from "effect/Option"
import * as Scene from "foldkit/scene"
import * as Url from "foldkit/url"
import { describe, it } from "vite-plus/test"

import * as Main from "../src/main.ts"

const flags: Main.Flags = {
  sidebar: {
    mode: "Desktop",
    theme: { preferredTheme: "System", systemTheme: "Light" },
  },
}

const modelAt = (path: string): Main.Model => {
  const [model] = Main.init(
    flags,
    Url.fromString(`http://localhost${path}`).pipe(Option.getOrThrow),
  )
  return {
    ...model,
    setup: Main.Model.fields.setup.cases.Ready.make({}),
  }
}

describe("main navigation", () => {
  it("renders policies as its own sidebar page", () => {
    Scene.scene(
      { update: Main.update, view: Main.view },
      Scene.given(modelAt("/policies")),
      Scene.expect(Scene.selector('a[href="/policies"]')).toHaveAttr(
        "aria-current",
        "page",
      ),
      Scene.expect(Scene.role("heading", { name: "Policies" })).toExist(),
      Scene.expect(Scene.role("button", { name: "New policy" })).toBeDisabled(),
      Scene.expect(
        Scene.role("button", { name: "New label rule" }),
      ).not.toExist(),
    )
  })

  it("keeps auto-labeling focused on label rules", () => {
    Scene.scene(
      { update: Main.update, view: Main.view },
      Scene.given(modelAt("/auto-labeling")),
      Scene.expect(Scene.selector('a[href="/auto-labeling"]')).toHaveAttr(
        "aria-current",
        "page",
      ),
      Scene.expect(Scene.role("heading", { name: "Auto-labeling" })).toExist(),
      Scene.expect(
        Scene.role("button", { name: "New label rule" }),
      ).toBeDisabled(),
      Scene.expect(Scene.role("button", { name: "New policy" })).not.toExist(),
    )
  })
})

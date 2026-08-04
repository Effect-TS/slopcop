import { describe, expect, it } from "vite-plus/test"

import { Command } from "../src/index.ts"

describe("Command public API", () => {
  it("exports a typed bundle factory", () => {
    const bundle = Command.create<string, "open" | "close">()

    expect(bundle.init({ id: "command" }).id).toBe("command")
    expect(typeof bundle.update).toBe("function")
    expect(typeof bundle.view).toBe("function")
  })
})

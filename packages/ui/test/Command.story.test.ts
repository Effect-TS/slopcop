import { Option } from "effect"
import * as Story from "foldkit/story"
import { describe, expect, it } from "vite-plus/test"

import { Command } from "../src/index.ts"

const Palette = Command.create<string, "Calendar" | "Billing">()

describe("Command", () => {
  it("initializes with searchable command defaults", () => {
    const model = Command.init({ id: "palette" })

    expect(model.id).toBe("palette")
    expect(model.query).toBe("")
    expect(Option.isNone(model.maybeActiveValue)).toBe(true)
    expect(model.loop).toBe(false)
    expect(model.vimBindings).toBe(true)
  })

  it("updates query and active value", () => {
    Story.story(
      Command.update,
      Story.given(Command.init({ id: "palette" })),
      Story.message(
        Command.UpdatedQuery({
          query: "bill",
          maybeActiveValue: Option.some("Billing"),
        }),
      ),
      Story.model((model) => {
        expect(model.query).toBe("bill")
        expect(model.maybeActiveValue).toEqual(Option.some("Billing"))
      }),
      Story.Command.expectNone(),
      Story.expectNoOutMessage(),
    )
  })

  it("scrolls keyboard-activated items into view", () => {
    Story.story(
      Command.update,
      Story.given(Command.init({ id: "palette" })),
      Story.message(
        Command.ActivatedItem({
          value: "Calendar",
          sourceIndex: 2,
          activationTrigger: "Keyboard",
          screenX: Option.none(),
          screenY: Option.none(),
        }),
      ),
      Story.model((model) => {
        expect(model.maybeActiveValue).toEqual(Option.some("Calendar"))
      }),
      Story.Command.resolve(
        Command.ScrollIntoView,
        Command.CompletedScrollIntoView(),
      ),
      Story.expectNoOutMessage(),
    )
  })

  it("activates pointer items without scrolling", () => {
    Story.story(
      Command.update,
      Story.given(Command.init({ id: "palette" })),
      Story.message(
        Command.ActivatedItem({
          value: "Calendar",
          sourceIndex: 0,
          activationTrigger: "Pointer",
          screenX: Option.some(10),
          screenY: Option.some(20),
        }),
      ),
      Story.model((model) => {
        expect(model.maybeActiveValue).toEqual(Option.some("Calendar"))
      }),
      Story.Command.expectNone(),
    )
  })

  it("emits a typed selected out message", () => {
    Story.story(
      Palette.update,
      Story.given(Palette.init({ id: "palette" })),
      Story.message(Command.RequestedItemSelection({ value: "Billing" })),
      Story.expectOutMessage(Command.Selected({ value: "Billing" })),
      Story.Command.expectNone(),
    )
  })
})

import type { HtmlBuilder } from "foldkit/html"
import * as Scene from "foldkit/scene"
import { describe, it } from "vite-plus/test"

import { Command } from "../src/index.ts"

type Item = Readonly<{
  value: "calendar" | "billing" | "settings"
  label: string
  group: "suggestions" | "settings"
  disabled?: boolean
  keywords?: ReadonlyArray<string>
}>

const items: ReadonlyArray<Item> = [
  { value: "calendar", label: "Calendar", group: "suggestions" },
  {
    value: "billing",
    label: "Billing",
    group: "settings",
    keywords: ["payment"],
  },
  { value: "settings", label: "Settings", group: "settings", disabled: true },
]

const Palette = Command.create<Item, Item["value"]>()

const sceneView = (model: Command.Model, h: HtmlBuilder<Command.Message>) =>
  Palette.view(
    model,
    {
      items,
      ariaLabel: "Command palette",
      listAriaLabel: "Commands",
      inputPlaceholder: "Type a command...",
      itemToValue: (item) => item.value,
      itemToSearchText: (item) => item.label,
      itemToKeywords: (item) => item.keywords ?? [],
      isItemDisabled: (item) => item.disabled ?? false,
      itemGroupKey: (item) => item.group,
      groupToConfig: (group) => ({
        heading: group === "suggestions" ? "Suggestions" : "Settings",
      }),
      empty: { content: "No results found." },
      itemToConfig: (item) => ({ content: item.label }),
      toView: (render) =>
        h.div(
          [...render.root],
          [
            h.div([...render.inputWrapper], [h.input([...render.input])]),
            h.div(
              [...render.list],
              [
                ...(render.empty
                  ? [
                      h.div(
                        [...render.empty.attributes],
                        [render.empty.content],
                      ),
                    ]
                  : []),
                ...render.groups.flatMap((group) => [
                  ...(group.separator.length > 0
                    ? [h.div([...group.separator], [])]
                    : []),
                  h.div(
                    [...group.group],
                    [
                      ...(group.headingContent === undefined
                        ? []
                        : [h.div([...group.heading], [group.headingContent])]),
                      ...group.items.map((item) =>
                        h.div([...item.item], [item.content]),
                      ),
                    ],
                  ),
                ]),
              ],
            ),
          ],
        ),
    },
    h,
  )

const input = Scene.selector("input")
const list = Scene.selector('[role="listbox"]')
const calendar = Scene.selector("#palette-item-0")
const billing = Scene.selector("#palette-item-1")
const settings = Scene.selector("#palette-item-2")

describe("Command view", () => {
  it("publishes combobox/listbox/option ARIA relationships", () => {
    Scene.scene(
      { update: Palette.update, view: sceneView },
      Scene.given(Palette.init({ id: "palette" })),
      Scene.expect(input).toHaveAttr("role", "combobox"),
      Scene.expect(input).toHaveAttr("aria-expanded", "true"),
      Scene.expect(input).toHaveAttr("aria-controls", "palette-list"),
      Scene.expect(input).toHaveAttr("aria-label", "Command palette"),
      Scene.expect(list).toHaveAttr("aria-label", "Commands"),
      Scene.expect(calendar).toHaveAttr("role", "option"),
      Scene.expect(calendar).toHaveAttr("data-active", ""),
      Scene.expect(settings).toHaveAttr("aria-disabled", "true"),
    )
  })

  it("filters from input text and shows aliases", () => {
    Scene.scene(
      { update: Palette.update, view: sceneView },
      Scene.given(Palette.init({ id: "palette" })),
      Scene.type(input, "pay"),
      Scene.expect(billing).toExist(),
      Scene.expect(calendar).toBeAbsent(),
      Scene.expect(input).toHaveAttr("aria-activedescendant", "palette-item-1"),
    )
  })

  it("shows empty content when nothing matches", () => {
    Scene.scene(
      { update: Palette.update, view: sceneView },
      Scene.given(Palette.init({ id: "palette" })),
      Scene.type(input, "zzz"),
      Scene.expect(Scene.text("No results found.")).toExist(),
      Scene.expect(calendar).toBeAbsent(),
    )
  })

  it("moves active item with keyboard and skips disabled items", () => {
    Scene.scene(
      { update: Palette.update, view: sceneView },
      Scene.given(Palette.init({ id: "palette" })),
      Scene.expect(calendar).toHaveAttr("data-active", ""),
      Scene.keydown(input, "ArrowDown"),
      Scene.Command.resolve(
        Command.ScrollIntoView,
        Command.CompletedScrollIntoView(),
      ),
      Scene.expect(billing).toHaveAttr("data-active", ""),
      Scene.keydown(input, "ArrowDown"),
      Scene.Command.expectNone(),
      Scene.expect(billing).toHaveAttr("data-active", ""),
      Scene.expect(settings).not.toHaveAttr("data-active"),
    )
  })

  it("selects the active item with Enter", () => {
    Scene.scene(
      { update: Palette.update, view: sceneView },
      Scene.given(Palette.init({ id: "palette" })),
      Scene.keydown(input, "ArrowDown"),
      Scene.Command.resolve(
        Command.ScrollIntoView,
        Command.CompletedScrollIntoView(),
      ),
      Scene.keydown(input, "Enter"),
      Scene.expectOutMessage(Command.Selected({ value: "billing" })),
    )
  })

  it("selects items by click", () => {
    Scene.scene(
      { update: Palette.update, view: sceneView },
      Scene.given(Palette.init({ id: "palette" })),
      Scene.click(billing),
      Scene.expectOutMessage(Command.Selected({ value: "billing" })),
    )
  })
})

import { describe, expect, it } from "vite-plus/test"

import {
  defaultFilter,
  resolveFilteredItems,
  type FilterInput,
} from "../src/Command.ts"

const input = (
  value: string,
  sourceIndex: number,
  overrides: Partial<FilterInput<string, string>> = {},
): FilterInput<string, string> => ({
  item: value,
  value,
  sourceIndex,
  searchText: value,
  keywords: [],
  isDisabled: false,
  ...overrides,
})

describe("Command filtering", () => {
  it("preserves source order for an empty query", () => {
    const result = resolveFilteredItems({
      items: [input("Settings", 0), input("Calendar", 1), input("Billing", 2)],
      query: "",
      shouldFilter: true,
      filter: defaultFilter,
    })

    expect(result.items.map((item) => item.value)).toEqual([
      "Settings",
      "Calendar",
      "Billing",
    ])
  })

  it("ranks exact and prefix matches ahead of weaker matches", () => {
    const result = resolveFilteredItems({
      items: [
        input("Search Calendar", 0),
        input("Calendar", 1),
        input("Calculator", 2),
      ],
      query: "cal",
      shouldFilter: true,
      filter: defaultFilter,
    })

    expect(result.items.map((item) => item.value)).toEqual([
      "Calendar",
      "Calculator",
      "Search Calendar",
    ])
  })

  it("matches keywords as aliases", () => {
    const result = resolveFilteredItems({
      items: [
        input("Profile", 0),
        input("Billing", 1, { keywords: ["invoice", "payment"] }),
      ],
      query: "pay",
      shouldFilter: true,
      filter: defaultFilter,
    })

    expect(result.items.map((item) => item.value)).toEqual(["Billing"])
  })

  it("keeps caller order and all items when filtering is disabled", () => {
    const result = resolveFilteredItems({
      items: [input("Alpha", 0), input("Beta", 1)],
      query: "zzz",
      shouldFilter: false,
      filter: defaultFilter,
    })

    expect(result.items.map((item) => item.value)).toEqual(["Alpha", "Beta"])
  })

  it("orders groups by their highest ranked visible item", () => {
    const result = resolveFilteredItems({
      items: [
        input("Profile", 0, { groupKey: "settings" }),
        input("Calendar", 1, { groupKey: "suggestions" }),
        input("Calculator", 2, { groupKey: "suggestions" }),
      ],
      query: "calc",
      shouldFilter: true,
      filter: defaultFilter,
    })

    expect(result.groups.map((group) => group.key)).toEqual(["suggestions"])
    expect(result.groups[0]?.items.map((item) => item.value)).toEqual([
      "Calculator",
    ])
  })
})

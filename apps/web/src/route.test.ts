import { Option } from "effect"
import type { Url } from "foldkit/url"
import { describe, expect, test } from "vite-plus/test"

import { urlToAppRoute } from "./route"

const url = (pathname: string): Url => ({
  protocol: "https:",
  host: "slopcop.effectful.co",
  port: Option.none(),
  pathname,
  search: Option.none(),
  hash: Option.none(),
})

describe("route", () => {
  test("parses the dashboard route", () => {
    expect(urlToAppRoute(url("/"))).toEqual({
      _tag: "Dashboard",
    })
  })

  test("falls back for unknown paths", () => {
    expect(urlToAppRoute(url("/unknown"))).toEqual({
      _tag: "NotFound",
      path: "/unknown",
    })
  })
})

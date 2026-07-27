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
  test.each([
    ["/", "Dashboard"],
    ["/repositories", "Repositories"],
    ["/activity", "Activity"],
    ["/reviews", "Reviews"],
    ["/slop-detection", "SlopDetection"],
    ["/commands", "Commands"],
    ["/settings", "Settings"],
  ])("parses %s", (pathname, tag) => {
    expect(urlToAppRoute(url(pathname))._tag).toBe(tag)
  })

  test("parses a repository workspace", () => {
    expect(urlToAppRoute(url("/repositories/Effect-TS/effect"))).toEqual({
      _tag: "RepositoryWorkspace",
      owner: "Effect-TS",
      repo: "effect",
    })
  })

  test("falls back for unknown paths", () => {
    expect(urlToAppRoute(url("/unknown"))).toEqual({
      _tag: "NotFound",
      path: "/unknown",
    })
  })
})

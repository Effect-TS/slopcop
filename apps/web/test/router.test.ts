import * as Option from "effect/Option"
import * as Url from "foldkit/url"
import { describe, expect, it } from "vite-plus/test"

import * as Router from "../src/router.ts"

const url = (path: string) =>
  Url.fromString(`http://localhost${path}`).pipe(Option.getOrThrow)

describe("router", () => {
  it("maps policies and auto-labeling to distinct top-level routes", () => {
    expect(Router.urlToAppRoute(url("/policies"))).toEqual({
      _tag: "Policies",
    })
    expect(Router.urlToAppRoute(url("/auto-labeling"))).toEqual({
      _tag: "AutoLabeling",
    })
    expect(Router.policiesRouter()).toBe("/policies")
    expect(Router.autoLabelingRouter()).toBe("/auto-labeling")
  })
})

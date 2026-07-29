import * as OpenApi from "effect/unstable/httpapi/OpenApi"
import { describe, expect, test } from "vite-plus/test"

import { RootApi } from "../src/RootApi.ts"

describe("RootApi", () => {
  const specification = OpenApi.fromApi(RootApi)

  test("protects labeling endpoints with the trusted Access identity header", () => {
    expect(specification.components.securitySchemes.access).toEqual({
      type: "apiKey",
      name: "x-slopcop-access-sub",
      in: "header",
    })
    expect(
      specification.paths["/api/v1/repositories/{owner}/{repo}/labeling-rules"]
        ?.get?.security,
    ).toEqual([{ access: [] }])
    expect(
      specification.paths[
        "/api/v1/repositories/{owner}/{repo}/labeling-rules/audit"
      ]?.get?.security,
    ).toEqual([{ access: [] }])
    expect(
      specification.paths["/api/v1/activity/labeling-rules"]?.get?.security,
    ).toEqual([{ access: [] }])
  })

  test("exposes authenticated repository management endpoints", () => {
    expect(specification.paths["/api/v1/repositories"]?.get?.security).toEqual([
      { access: [] },
    ])
    expect(
      specification.paths["/api/v1/repositories/{owner}/{repo}/enabled"]?.patch
        ?.security,
    ).toEqual([{ access: [] }])
  })

  test("does not expose custom OAuth or session endpoints", () => {
    expect(
      Object.keys(specification.paths).some((path) =>
        path.startsWith("/api/v1/auth"),
      ),
    ).toBe(false)
  })
})

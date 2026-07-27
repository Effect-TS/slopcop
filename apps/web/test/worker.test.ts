import { describe, expect, test } from "vite-plus/test"

import worker from "../worker.ts"

describe("Website Worker API authorization", () => {
  test("overwrites browser identity and removes cookies in local development", async () => {
    let forwardedIdentity: string | null = null
    let forwardedCookie: string | null = null
    const response = await worker.fetch(
      new Request("https://slopcop.test/api/v1/repositories", {
        headers: {
          cookie: "slopcop_session=stale",
          "x-slopcop-access-sub": "spoofed",
        },
      }),
      {
        SLOPCOP_ACCESS_MODE: "local-development",
        API: {
          fetch: (request) => {
            forwardedIdentity = request.headers.get("x-slopcop-access-sub")
            forwardedCookie = request.headers.get("cookie")
            return Promise.resolve(new Response("ok"))
          },
        },
      },
    )

    expect(response.status).toBe(200)
    expect(forwardedIdentity).toBe("local-development")
    expect(forwardedCookie).toBeNull()
  })

  test("fails closed when the Access assertion is missing", async () => {
    let forwarded = false
    const response = await worker.fetch(
      new Request("https://slopcop.effectful.co/api/v1/repositories"),
      {
        SLOPCOP_ACCESS_MODE: "cloudflare-access",
        CLOUDFLARE_ACCESS_AUD: "audience",
        CLOUDFLARE_ACCESS_ISSUER: "https://effectful.cloudflareaccess.com",
        API: {
          fetch: () => {
            forwarded = true
            return Promise.resolve(new Response("unexpected"))
          },
        },
      },
    )

    expect(response.status).toBe(401)
    expect(forwarded).toBe(false)
  })
})

import { createRemoteJWKSet, jwtVerify } from "jose"

interface Env {
  readonly API: {
    readonly fetch: (request: Request) => Promise<Response>
  }
  readonly ASSETS: {
    readonly fetch: (request: Request) => Promise<Response>
  }
  readonly SLOPCOP_ACCESS_MODE: "cloudflare-access" | "local-development"
  readonly CLOUDFLARE_ACCESS_AUD?: string
  readonly CLOUDFLARE_ACCESS_ISSUER?: string
}

const ACCESS_IDENTITY_HEADER = "x-slopcop-access-sub"
const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

const accessJwks = (issuer: string) => {
  const cached = jwksByIssuer.get(issuer)
  if (cached !== undefined) {
    return cached
  }
  const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`))
  jwksByIssuer.set(issuer, jwks)
  return jwks
}

const accessSubject = async (request: Request, env: Env) => {
  if (env.SLOPCOP_ACCESS_MODE === "local-development") {
    return "local-development"
  }
  if (
    env.CLOUDFLARE_ACCESS_AUD === undefined ||
    env.CLOUDFLARE_ACCESS_ISSUER === undefined
  ) {
    return undefined
  }
  const token = request.headers.get("cf-access-jwt-assertion")
  if (token === null) {
    return undefined
  }
  const { payload } = await jwtVerify(
    token,
    accessJwks(env.CLOUDFLARE_ACCESS_ISSUER),
    {
      issuer: env.CLOUDFLARE_ACCESS_ISSUER,
      audience: env.CLOUDFLARE_ACCESS_AUD,
    },
  )
  return payload.type === "app" &&
    typeof payload.sub === "string" &&
    payload.sub.length > 0
    ? payload.sub
    : undefined
}

const forwardApiRequest = async (request: Request, env: Env) => {
  const subject = await accessSubject(request, env).catch(() => undefined)
  if (subject === undefined) {
    return new Response("Unauthorized", { status: 401 })
  }
  const headers = new Headers(request.headers)
  headers.delete("cookie")
  headers.delete("cf-access-jwt-assertion")
  headers.set(ACCESS_IDENTITY_HEADER, subject)
  return env.API.fetch(new Request(request, { headers }))
}

export default {
  fetch: (request: Request, env: Env) => {
    const url = new URL(request.url)
    return url.pathname.startsWith("/api/")
      ? forwardApiRequest(request, env)
      : env.ASSETS.fetch(request)
  },
}

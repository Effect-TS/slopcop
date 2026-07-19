import type { PgClient } from "@effect/sql-pg/PgClient"
import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Drizzle from "alchemy/Drizzle"
import * as Neon from "alchemy/Neon"
import type { EffectPgDatabase } from "drizzle-orm/effect-postgres"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"

export class Database extends Context.Service<
  Database,
  EffectPgDatabase & {
    readonly $client: PgClient
  }
>()("@slopcop/bot/Sql/Database") {}

export const NeonDatabase = Effect.gen(function* () {
  const { stage } = yield* Alchemy.Stack

  const schema = yield* Drizzle.Schema("SlopCopDatabaseSchema", {
    schema: "./apps/bot/src/Sql/schema.ts",
    out: "./apps/bot/src/migrations",
  })

  const project = stage.startsWith("pr-")
    ? yield* Neon.Project.ref("SlopCopDatabase", { stage: `staging-${stage}` })
    : yield* Neon.Project("SlopCopDatabase", { region: "aws-us-east-1" })

  const branch = yield* Neon.Branch("Branch", {
    project,
    migrationsDir: schema.out,
  })

  return { project, branch, schema }
})

export const Hyperdrive = Effect.gen(function* () {
  const { branch } = yield* NeonDatabase
  return yield* Cloudflare.Hyperdrive.Connection("SlopCopHyperdrive", {
    origin: branch.origin,
    caching: { disabled: true },
  })
})

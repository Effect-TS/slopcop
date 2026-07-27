import * as Cloudflare from "alchemy/Cloudflare"
import { D1 } from "alchemy/SQL/D1"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as String from "effect/String"
import * as SqlClient from "effect/unstable/sql/SqlClient"

export const D1Database = Cloudflare.D1.Database("SlopCopDatabase", {
  name: "slopcop",
  migrationsTable: "slopcop_migrations",
  migrationsDir: "./apps/bot/src/Sql/migrations",
})

export const DatabaseLayer = Layer.effect(
  SqlClient.SqlClient,
  Effect.gen(function* () {
    const resource = yield* D1Database
    const d1 = yield* Cloudflare.D1.QueryDatabase(resource)
    return yield* D1(d1, {
      transformQueryNames: String.camelToSnake,
      transformResultNames: String.snakeToCamel,
    })
  }),
)

import * as Cloudflare from "alchemy/Cloudflare"
import { D1 } from "alchemy/SQL/D1"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as String from "effect/String"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import * as CloudflareResourceNames from "./CloudflareResourceNames.ts"

export const makeD1Database = (
  resourceNames: CloudflareResourceNames.ResourceNames,
) =>
  Cloudflare.D1.Database("SlopCopDatabase", {
    name: resourceNames.name("slopcop"),
    migrationsTable: "slopcop_migrations",
    migrationsDir: "./packages/infra/src/Sql/migrations",
  })

export const D1Database = makeD1Database(CloudflareResourceNames.production)

export const makeDatabaseLayer = (database: typeof D1Database) =>
  Layer.effect(
    SqlClient.SqlClient,
    Effect.gen(function* () {
      const resource = yield* database
      const d1 = yield* Cloudflare.D1.QueryDatabase(resource)
      return yield* D1(d1, {
        transformQueryNames: String.camelToSnake,
        transformResultNames: String.snakeToCamel,
      })
    }),
  )

export const DatabaseLayer = makeDatabaseLayer(D1Database)

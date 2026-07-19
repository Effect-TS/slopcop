import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Drizzle from "alchemy/Drizzle"
import * as Neon from "alchemy/Neon"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import Worker from "./apps/bot/src/Worker.ts"
import { Hyperdrive, NeonDatabase } from "./apps/bot/src/Sql.ts"
import {
  GitHubEventsQueue,
  GitHubEventsDeadLetterQueue,
} from "./apps/bot/src/GitHub/GitHubEvents.ts"

const Providers = Layer.mergeAll(
  Cloudflare.providers(),
  Drizzle.providers(),
  Neon.providers(),
)
const State = Cloudflare.state()

export default Alchemy.Stack(
  "SlopCop",
  {
    providers: Providers,
    state: State,
  },
  Effect.gen(function* () {
    const db = yield* NeonDatabase
    const hyperdrive = yield* Hyperdrive

    const queue = yield* GitHubEventsQueue
    const deadLetterQueue = yield* GitHubEventsDeadLetterQueue

    const worker = yield* Worker

    return {
      databaseName: db.branch.databaseName,
      databaseBranchName: db.branch.branchName,

      hyperdriveName: hyperdrive.name,

      queueName: queue.queueName,
      deadLetterQueueName: deadLetterQueue.queueName,

      workerName: worker.workerName,
      workerUrl: worker.url,
    }
  }),
)

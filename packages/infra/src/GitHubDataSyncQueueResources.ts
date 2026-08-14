import * as Cloudflare from "alchemy/Cloudflare"
import * as CloudflareResourceNames from "./CloudflareResourceNames.ts"

export const makeGitHubDataSyncQueueResources = (
  resourceNames: CloudflareResourceNames.ResourceNames,
) => {
  const queue = Cloudflare.Queues.Queue("GitHubDataSyncQueue", {
    name: resourceNames.name("slopcop-github-data-sync"),
  })
  const deadLetterQueueName = resourceNames.name(
    "slopcop-github-data-sync-dead-letter",
  )
  const deadLetterQueue = Cloudflare.Queues.Queue(
    "GitHubDataSyncDeadLetterQueue",
    { name: deadLetterQueueName },
  )
  return { queue, deadLetterQueueName, deadLetterQueue }
}

export const {
  queue: GitHubDataSyncQueue,
  deadLetterQueueName: GITHUB_DATA_SYNC_DEAD_LETTER_QUEUE_NAME,
  deadLetterQueue: GitHubDataSyncDeadLetterQueue,
} = makeGitHubDataSyncQueueResources(CloudflareResourceNames.production)

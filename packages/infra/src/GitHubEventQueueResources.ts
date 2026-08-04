import * as Cloudflare from "alchemy/Cloudflare"
import * as CloudflareResourceNames from "./CloudflareResourceNames.ts"

export const makeGitHubEventQueueResources = (
  resourceNames: CloudflareResourceNames.ResourceNames,
) => {
  const queue = Cloudflare.Queues.Queue("GitHubEventsQueue", {
    name: resourceNames.name("slopcop-github-webhook-events"),
  })
  const deadLetterQueueName = resourceNames.name(
    "slopcop-github-webhook-events-dead-letter",
  )
  const deadLetterQueue = Cloudflare.Queues.Queue(
    "GitHubEventsDeadLetterQueue",
    { name: deadLetterQueueName },
  )
  return { queue, deadLetterQueueName, deadLetterQueue }
}

export const {
  queue: GitHubEventsQueue,
  deadLetterQueueName: GITHUB_EVENTS_DEAD_LETTER_QUEUE_NAME,
  deadLetterQueue: GitHubEventsDeadLetterQueue,
} = makeGitHubEventQueueResources(CloudflareResourceNames.production)

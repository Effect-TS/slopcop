import * as Sidebar from "@slopcop/ui/Sidebar"
import * as Schema from "effect/Schema"
import * as RepositorySelector from "../repository-selector"
import * as Theme from "../../features/theme"
import * as GitHubSync from "../../features/github-sync"

export const Model = Schema.Struct({
  repositorySelector: RepositorySelector.Model,
  sidebar: Sidebar.Model,
  theme: Theme.Model,
  githubSync: GitHubSync.Model,
})
export type Model = typeof Model.Type

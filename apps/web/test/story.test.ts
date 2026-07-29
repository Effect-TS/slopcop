import { Story } from "foldkit"
import { expect, test } from "vite-plus/test"

import { Dashboard } from "../src/layout/index.ts"
import { GotDashboardMessage } from "../src/message.ts"
import { Model } from "../src/model.ts"
import {
  Activity,
  Repositories,
  RepositoryWorkspace,
} from "../src/page/index.ts"
import { initialDashboardRoute } from "../src/route.ts"
import { update } from "../src/update.ts"

test("delegates dashboard messages through the root model", () => {
  const [dashboard] = Dashboard.init()
  const [repositories] = Repositories.init(false)
  const [repositoryWorkspace] = RepositoryWorkspace.init(undefined)
  const [activity] = Activity.init(false)

  Story.story(
    update,
    Story.with(
      Model.make({
        route: initialDashboardRoute,
        dashboard,
        repositories,
        repositoryWorkspace,
        activity,
      }),
    ),
    Story.message(GotDashboardMessage({ message: Dashboard.ToggledSidebar() })),
    Story.model((model) => {
      expect(model.dashboard.isSidebarOpen).toBe(true)
    }),
  )
})

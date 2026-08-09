import * as Option from "effect/Option"
import * as Url from "foldkit/url"
import { describe, expect, it } from "vite-plus/test"
import * as Main from "../../../src/main.ts"
import * as Settings from "../../../src/features/settings.ts"

const enabledRepository = {
  owner: "Effect-TS",
  repo: "effect",
  isPrivate: false,
  enabled: true,
} as const

const disabledRepository = {
  owner: "effect",
  repo: "slopcop",
  isPrivate: true,
  enabled: false,
} as const

const selectedModel = () =>
  Settings.update(
    Settings.init(),
    Settings.SelectedRepositoryChanged({ repository: enabledRepository }),
  )[0]

describe("Settings update", () => {
  it("issues an update command while preserving the persisted value", () => {
    const [model, commands] = Settings.update(
      selectedModel(),
      Settings.ToggledEnabled(),
    )

    expect(model.enabled).toBe(true)
    expect(model.repository).toEqual(enabledRepository)
    expect(model.saveState._tag).toBe("SaveSaving")
    expect(commands).toHaveLength(1)
    expect(commands[0]).toMatchObject({
      name: "UpdateRepositoryEnabled",
      args: {
        requestId: 1,
        repository: { owner: "Effect-TS", repo: "effect" },
        enabled: false,
      },
    })
  })

  it("does not issue overlapping updates", () => {
    const [saving] = Settings.update(selectedModel(), Settings.ToggledEnabled())
    const [unchanged, commands] = Settings.update(
      saving,
      Settings.ToggledEnabled(),
    )

    expect(unchanged).toEqual(saving)
    expect(commands).toEqual([])
  })

  it("uses the returned repository summary after success", () => {
    const [saving] = Settings.update(selectedModel(), Settings.ToggledEnabled())
    const updated = { ...enabledRepository, isPrivate: true, enabled: false }
    const [model, commands] = Settings.update(
      saving,
      Settings.UpdatedRepositoryEnabled({ requestId: 1, repository: updated }),
    )

    expect(model.repository).toEqual(updated)
    expect(model.enabled).toBe(false)
    expect(model.saveState._tag).toBe("SaveIdle")
    expect(commands).toEqual([])
  })

  it("preserves the persisted value after failure and retries", () => {
    const [saving] = Settings.update(selectedModel(), Settings.ToggledEnabled())
    const [failed] = Settings.update(
      saving,
      Settings.FailedToUpdateRepositoryEnabled({
        requestId: 1,
        repository: { owner: "Effect-TS", repo: "effect" },
        message: "Could not save. Use the switch to retry.",
      }),
    )

    expect(failed.enabled).toBe(true)
    expect(failed.saveState._tag).toBe("SaveFailed")

    const [retrying, commands] = Settings.update(
      failed,
      Settings.ToggledEnabled(),
    )
    expect(retrying.saveState._tag).toBe("SaveSaving")
    expect(commands[0]).toMatchObject({
      name: "UpdateRepositoryEnabled",
      args: { requestId: 2, enabled: false },
    })
  })

  it("ignores stale completions after the selected repository changes", () => {
    const [saving] = Settings.update(selectedModel(), Settings.ToggledEnabled())
    const [changed] = Settings.update(
      saving,
      Settings.SelectedRepositoryChanged({ repository: disabledRepository }),
    )
    const [model] = Settings.update(
      changed,
      Settings.UpdatedRepositoryEnabled({
        requestId: 1,
        repository: { ...enabledRepository, enabled: false },
      }),
    )

    expect(model).toEqual(changed)
    expect(model.repository).toEqual(disabledRepository)
    expect(model.enabled).toBe(false)
    expect(model.saveState._tag).toBe("SaveIdle")
  })

  it("resets state from each newly selected repository", () => {
    const [saving] = Settings.update(selectedModel(), Settings.ToggledEnabled())
    const [changed] = Settings.update(
      saving,
      Settings.SelectedRepositoryChanged({ repository: disabledRepository }),
    )

    expect(changed.repository).toEqual(disabledRepository)
    expect(changed.enabled).toBe(false)
    expect(changed.saveState._tag).toBe("SaveIdle")
    expect(changed.nextRequestId).toBe(2)
  })

  it("refreshes parent repository data from the explicit success message", () => {
    const flags: Main.Flags = {
      sidebar: {
        mode: "Desktop",
        theme: { preferredTheme: "System", systemTheme: "Light" },
      },
    }
    const [initial] = Main.init(
      flags,
      Url.fromString("http://localhost/settings").pipe(Option.getOrThrow),
    )
    const [saving] = Settings.update(selectedModel(), Settings.ToggledEnabled())
    const [, commands] = Main.update(
      { ...initial, settings: saving },
      Main.GotSettingsMessage({
        message: Settings.UpdatedRepositoryEnabled({
          requestId: 1,
          repository: { ...enabledRepository, enabled: false },
        }),
      }),
    )

    expect(commands.map((command) => command.name)).toEqual([
      "LoadRepositories",
    ])
  })
})

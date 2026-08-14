import { readFileSync, readdirSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import { describe, expect, it } from "vite-plus/test"

const directory = new URL("../src/Sql/migrations/", import.meta.url)
const migrations = readdirSync(directory)
  .filter((name) => name.endsWith(".sql"))
  .sort()

const setup = () => {
  const database = new DatabaseSync(":memory:")
  database.exec("PRAGMA foreign_keys=ON")
  migrations.forEach((name) =>
    database.exec(readFileSync(new URL(name, directory), "utf8")),
  )
  database.exec(`
    INSERT INTO github_repositories (
      id,github_id,owner,repo,installation_id,enabled,rules_revision
    ) VALUES ('repo-1','123','effect-ts','effect','456',1,0)
  `)
  return database
}

describe("GitHub data cache migration", () => {
  it("stores dataset-specific label and pull request snapshots", () => {
    const database = setup()
    database.exec(`
      INSERT INTO github_repository_labels (
        repository_id,name,description,color,generation
      ) VALUES ('repo-1','bug','A bug','ff0000',1);
      INSERT INTO github_repository_label_syncs (
        repository_id,status,next_refresh_at,active_generation
      ) VALUES ('repo-1','ready',1000,1);
      INSERT INTO github_pull_requests (
        repository_id,number,state,title,body,draft,author,base_ref,head_sha,
        github_created_at,github_updated_at,generation
      ) VALUES ('repo-1',42,'open','Fix',NULL,0,'octocat','main','abc',100,200,1);
      INSERT INTO github_pull_request_syncs (
        repository_id,status,next_refresh_at,active_generation
      ) VALUES ('repo-1','ready',1000,1);
    `)
    expect(
      database.prepare("SELECT name,color FROM github_repository_labels").all(),
    ).toEqual([{ name: "bug", color: "ff0000" }])
    expect(
      database
        .prepare("SELECT number,state,title FROM github_pull_requests")
        .all(),
    ).toEqual([{ number: 42, state: "open", title: "Fix" }])
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([])
    database.close()
  })

  it("keeps generations distinct and rejects invalid source data", () => {
    const database = setup()
    database.exec(`
      INSERT INTO github_repository_labels (
        repository_id,name,description,color,generation
      ) VALUES
        ('repo-1','bug',NULL,'ff0000',1),
        ('repo-1','bug',NULL,'00ff00',2);
    `)
    expect(
      database
        .prepare(
          "SELECT generation,color FROM github_repository_labels ORDER BY generation",
        )
        .all(),
    ).toEqual([
      { generation: 1, color: "ff0000" },
      { generation: 2, color: "00ff00" },
    ])
    expect(() =>
      database.exec(`
        INSERT INTO github_pull_requests (
          repository_id,number,state,title,draft,base_ref,head_sha,
          github_created_at,github_updated_at,generation
        ) VALUES ('repo-1',0,'unknown','Invalid',2,'main','abc',100,200,1)
      `),
    ).toThrow()
    database.close()
  })
})

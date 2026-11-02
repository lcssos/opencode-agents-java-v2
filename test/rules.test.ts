import { describe, expect, test } from "bun:test"
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const read = (name: string) => readFileSync(fileURLToPath(new URL(`../rules/${name}`, import.meta.url)), "utf8")

describe("规则文件", () => {
  test("compact 第一行是注入标记", () => {
    expect(read("compact.md").split("\n")[0]).toBe("<!-- opencode-agents-java-v2:injected -->")
  })

  test("compact 覆盖四条硬约束", () => {
    const text = read("compact.md")
    for (const needle of ["mvnd", "官方文档", "sources.jar", "wait_for"]) expect(text).toContain(needle)
  })

  test("java-dev 明显比 compact 详细", () => {
    expect(read("java-dev.md").length).toBeGreaterThan(read("compact.md").length * 2)
  })

  test("java-dev 带参数表与 javap 禁令", () => {
    const text = read("java-dev.md")
    for (const needle of ["must_be_new", "javap -c", "MVND_OPTS", "dependency:sources"]) expect(text).toContain(needle)
  })

  test("package.json 的 files 包含 rules", () => {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"))
    expect(pkg.files).toContain("rules")
  })

  test("compact 控制在 30 行内（常驻成本）", () => {
    expect(read("compact.md").trimEnd().split("\n").length).toBeLessThanOrEqual(30)
  })

  test("两个规则文件都进了 npm 包清单", () => {
    // 直接问 npm 要打包清单：工作区能读到文件不代表 tarball 里有
    const out = Bun.spawnSync(
      ["npm", "pack", "--dry-run", "--json"],
      { cwd: fileURLToPath(new URL("..", import.meta.url)), stdout: "pipe", stderr: "pipe" },
    ).stdout.toString()
    const files: string[] = Object.values(JSON.parse(out))[0].files.map((f: any) => f.path)
    expect(files).toContain("rules/compact.md")
    expect(files).toContain("rules/java-dev.md")
  })
})

describe("规则缺失时的失败方式", () => {
  test("缺 rules/ 时 setup 抛错并指明原因，而不是静默注入空串", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agents-java-missing-"))
    const copy = join(dir, "index.ts")
    copyFileSync(fileURLToPath(new URL("../index.ts", import.meta.url)), copy)

    const broken = (await import(copy)).default
    const ctx = {
      session: { hook: async () => ({ dispose: async () => {} }) },
      skill: { transform: async () => ({ dispose: async () => {} }) },
    }

    await expect(broken.setup(ctx)).rejects.toThrow(/rules/)
    rmSync(dir, { recursive: true, force: true })
  })
})

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
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
})

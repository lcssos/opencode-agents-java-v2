import { describe, expect, test, beforeAll } from "bun:test"
import { readFileSync } from "node:fs"
import plugin from "../index.ts"

type Hook = (event: any) => void | Promise<void>

let contextHook: Hook
let skill: any

beforeAll(async () => {
  const ctx = {
    session: {
      hook: async (name: string, cb: Hook) => {
        if (name !== "context") throw new Error(`unexpected hook: ${name}`)
        contextHook = cb
        return { dispose: async () => {} }
      },
    },
    skill: {
      transform: async (cb: (editor: any) => void) => {
        cb({ add: (s: any) => (skill = s) })
        return { dispose: async () => {} }
      },
    },
  }
  await (plugin as any).setup(ctx)
})

const makeEvent = () => ({ system: [] as any[] })

describe("核心条款注入", () => {
  test("追加一段文本 part", async () => {
    const event = makeEvent()
    await contextHook(event)
    expect(event.system).toHaveLength(1)
    expect(event.system[0].type).toBe("text")
    expect(event.system[0].text).toContain("mvnd")
  })

  test("同一 event 重复调用不重复注入", async () => {
    const event = makeEvent()
    await contextHook(event)
    await contextHook(event)
    expect(event.system).toHaveLength(1)
  })

  test("保留已有 system part 且追加在末尾", async () => {
    const event = { system: [{ type: "text", text: "core" }] as any[] }
    await contextHook(event)
    expect(event.system).toHaveLength(2)
    expect(event.system[0].text).toBe("core")
    expect(event.system[1].text).toContain("opencode-agents-java-v2:injected")
  })

  test("插件 id 为 agents-java", () => {
    expect((plugin as any).id).toBe("agents-java")
  })
})

describe("java-dev skill", () => {
  test("已注册且可自动 invoke", () => {
    expect(skill.id).toBe("java-dev")
    expect(skill.autoinvoke).toBe(true)
    expect(skill.name).toBe("Java 工程开发规则")
  })

  test("description 点明触发场景", () => {
    expect(skill.description).toContain("Maven")
  })

  test("path 是绝对路径且指向真实文件", () => {
    expect(skill.path.startsWith("/")).toBe(true)
    expect(readFileSync(skill.path, "utf8")).toBe(skill.content)
  })

  test("content 比常驻注入内容长", async () => {
    const event = makeEvent()
    await contextHook(event)
    expect(skill.content.length).toBeGreaterThan(event.system[0].text.length * 2)
  })
})

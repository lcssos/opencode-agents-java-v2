import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { readFileSync } from "node:fs"
import plugin from "../index.ts"

type Hook = (event: any) => void | Promise<void>

let contextHook: Hook
let skill: any
let cleanup: (() => unknown) | undefined
let hookDisposed = 0
let skillDisposed = 0

beforeAll(async () => {
  const ctx = {
    session: {
      hook: async (name: string, cb: Hook) => {
        if (name !== "context") throw new Error(`unexpected hook: ${name}`)
        contextHook = cb
        return {
          dispose: async () => {
            hookDisposed++
          },
        }
      },
    },
    skill: {
      transform: async (cb: (editor: any) => void) => {
        cb({ add: (s: any) => (skill = s) })
        return {
          dispose: async () => {
            skillDisposed++
          },
        }
      },
    },
  }
  cleanup = (await (plugin as any).setup(ctx)) as (() => unknown) | undefined
})

// cleanup 必须最后测：它会让本文件的注册失效
afterAll(async () => {
  await cleanup?.()
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

describe("热重载 cleanup", () => {
  test("setup 返回清理函数", () => {
    expect(typeof cleanup).toBe("function")
  })

  test("清理函数 dispose 掉 hook 与 skill 两个注册", async () => {
    // afterAll 会再调一次，这里只要求"至少各调过一次"
    await cleanup?.()
    expect(hookDisposed).toBeGreaterThanOrEqual(1)
    expect(skillDisposed).toBeGreaterThanOrEqual(1)
  })
})

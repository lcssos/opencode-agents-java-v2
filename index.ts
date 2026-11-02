import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * opencode-agents-java-v2 —— 把 Java/Maven 开发规则交给每一个 session。
 *
 * 为什么不直接塞一份大 AGENTS.md
 * ------------------------------
 * 「查证优先级」「sources.jar 怎么读」「wait_for 参数表」这些细则只在碰到
 * Maven 和第三方 jar 时才有用。全量常驻等于让每条 session 都替它们付 token，
 * 而这些 token 大部分时候是白花的。
 *
 * 所以分成两层：
 *   - rules/compact.md   每轮注入，只留最容易踩的四条硬约束（约 400 token）。
 *   - rules/java-dev.md  注册成 skill `java-dev`，模型判断相关时自己拉全文。
 *
 * 规则本体是纯 Markdown，不装插件的人也能直接 cp 走；改规则只改 md，不动代码。
 */

const MARKER = "<!-- opencode-agents-java-v2:injected -->"

/** 读不到就是打包漏了 rules/，直接抛错，不要静默注入空串。 */
function loadRule(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./rules/${name}`, import.meta.url)), "utf8")
}

const COMPACT = loadRule("compact.md")
const FULL = loadRule("java-dev.md")
const SKILL_PATH = fileURLToPath(new URL("./rules/java-dev.md", import.meta.url))

export default {
  id: "agents-java",

  async setup(ctx: any) {
    const registration = await ctx.session.hook("context", (event: any) => {
      // 同一 event 可能被重复调用（重试、插件热重载），按标记幂等
      const injected = event.system.some((part: any) => part.type === "text" && part.text.startsWith(MARKER))
      if (injected) return
      event.system.push({ type: "text", text: COMPACT })
    })

    const skillRegistration = await ctx.skill.transform((editor: any) => {
      editor.add({
        id: "java-dev",
        name: "Java 工程开发规则",
        description: "写 Java、跑 Maven 构建、查第三方库行为、等待长任务或读 jar 源码时必读",
        path: SKILL_PATH,
        content: FULL,
        autoinvoke: true,
      })
    })

    return () => {
      void registration?.dispose?.()
      void skillRegistration?.dispose?.()
    }
  },
}

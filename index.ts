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

/**
 * 读规则文件。放在 setup 里调用，不放在模块顶层：
 * 模块顶层抛错会炸在整个插件加载器上（其它插件、其它项目一起受影响），
 * 而 setup 里的失败只归本插件的这一份配置。规则文件缺失就是打包漏了 rules/，
 * 必须抛错而不是静默注入空串——空串等于规则悄悄失效，最难查。
 */
function loadRule(name: string): string {
  const path = fileURLToPath(new URL(`./rules/${name}`, import.meta.url))
  try {
    return readFileSync(path, "utf8")
  } catch (error) {
    throw new Error(`opencode-agents-java-v2 读不到规则文件 ${path}；请确认 npm 包内含 rules/ 目录`)
  }
}

export default {
  id: "agents-java",

  async setup(ctx: any) {
    const compact = loadRule("compact.md")
    const full = loadRule("java-dev.md")
    const skillPath = fileURLToPath(new URL("./rules/java-dev.md", import.meta.url))

    const registration = await ctx.session.hook("context", (event: any) => {
      // 同一 event 可能被调用多次（插件被列两次、热重载后两个 hook 并存），按标记幂等
      const injected = event.system.some((part: any) => part.type === "text" && part.text.startsWith(MARKER))
      if (injected) return
      event.system.push({ type: "text", text: compact })
    })

    const skillRegistration = await ctx.skill.transform((editor: any) => {
      editor.add({
        id: "java-dev",
        name: "Java 工程开发规则",
        description: "写 Java、跑 Maven 构建、查第三方库行为、等待长任务或读 jar 源码时必读",
        path: skillPath,
        content: full,
        autoinvoke: true,
      })
    })

    return async () => {
      await registration?.dispose?.()
      await skillRegistration?.dispose?.()
    }
  },
}

# opencode-agents-java-v2 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把全局 AGENTS.md 里关于 Java/Maven 开发的规则做成一个 OpenCode V2 插件，每个 session 注入一小段核心条款，完整规则注册成 `java-dev` skill。

**Architecture:** 规则原文放在仓库 `rules/*.md`（纯 Markdown，可独立分发）；`index.ts` 在模块加载时读入两个文件，`setup(ctx)` 里用 `ctx.session.hook("context")` 往每轮请求的 `event.system` 追加核心条款，用 `ctx.skill.transform` 注册 skill。

**Tech Stack:** TypeScript（无编译步骤，`bun build` 仅做校验）、bun test、`@opencode/plugin` V2 API（不 import，用 `any`，与 `opencode-wait-for-v2` 一致）。

**Spec:** `docs/superpowers/specs/2026-11-02-opencode-agents-java-v2-design.md`

## Global Constraints

- 插件 id 为 `agents-java`；skill id 为 `java-dev`，`autoinvoke: true`。
- 注入标记固定为 `<!-- opencode-agents-java-v2:injected -->`，必须是 `rules/compact.md` 的第一行。
- 不 import `@opencode/plugin`：现有 `opencode-wait-for-v2` 也不用，避免 `bun build` 依赖未安装的包。
- 注入只能 `event.system.push`，不得删除或改写已有 part。
- 不读写用户的 `AGENTS.md`，不改写用户命令（不把 `mvn` 静默替换为 `mvnd`）。
- 仓库路径：`/Users/lcssos/wks/github/opencode-agents-java-v2`。
- 提交信息用简体中文，带 `feat/fix/docs/chore` 前缀。

## Review Focus

- **用户本机已有全局 AGENTS.md 写着同样条款**：重复注入不应产生副作用，也不能报错；条款必须能与系统提示里已有文本共存。
- **`event.system` 已有其它来源的 part**（核心提示、其它插件）：注入必须追加在末尾，原有顺序与内容不变。
- **`context` hook 被重复调用**：同一 event 上不能出现两段相同注入。
- **打包漏掉 `rules/` 目录**：用户 `npm install` 后 skill 的 `path` 指向不存在的文件——发布前必须用测试 + `npm pack --dry-run` 双重卡住。
- **插件热重载（`/reload`）重复 setup**：`setup` 必须返回 cleanup，把 hook 与 skill 注册都 dispose 掉，否则同一 session 出现双份注入。

---

### Task 1: 仓库骨架与规则文件

**Files:**
- Create: `.gitignore`、`LICENSE`、`package.json`、`rules/compact.md`、`rules/java-dev.md`
- Test: `test/rules.test.ts`

**Interfaces:**
- Produces: `rules/compact.md`（首行为注入标记）、`rules/java-dev.md`（skill 正文）；`package.json` 的 `name` 为 `opencode-agents-java-v2`，`files` 含 `rules`。

- [ ] **Step 1: 初始化仓库并建目录**

```bash
cd /Users/lcssos/wks/github/opencode-agents-java-v2
git init -b main
mkdir -p rules test scripts .github/workflows
```

- [ ] **Step 2: 写 `rules/compact.md`**

内容逐字如下（首行就是注入标记，不要改）：

```markdown
<!-- opencode-agents-java-v2:injected -->
## Java / Maven 工程硬约束

以下条款优先于一般习惯。细则见 skill `java-dev`。

1. **Maven 一律用 `mvnd`**，不要默认 `mvn`：`mvnd -o test`、`mvnd -o -DskipTests package`、`mvnd clean install -pl <module>`。项目文档里写的 `mvn ...` 执行时换成 `mvnd ...`。
   - 例外：项目带 Maven Wrapper 且要求固定版本时用 `./mvnw`；要对照原生 Maven 定位构建差异时用 `/usr/local/bin/mvn`；机器没有 `mvnd` 才回退 `mvn`。
   - `mvnd` 是常驻 daemon：改过 `~/.m2/mvnd.properties` 必须 `mvnd --stop` 才生效；daemon 的 JVM 参数用 `MVND_OPTS`（`MAVEN_OPTS` 对 daemon 无效）。

2. **查外部行为先查文档，不要一上来读源码**。顺序：官方文档 → GitHub issue/PR/release notes → 最小复现实测 → 最后才是 `*-sources.jar`。

3. **读第三方 jar 只读 `*-sources.jar`**：`unzip -p "$JAR" org/.../Xxx.java`；路径不确定先 `unzip -l "$JAR" | grep -i 关键词`。`javap` 只允许 `-public` 看签名，**禁止** `javap -c` 反汇编去反推实现。目标 1~2 次工具调用解决。

4. **长任务禁止 `sleep N; tail ...` 轮询**。用 `background: true` 启动并重定向到日志文件，然后一次 `wait_for(path=..., pattern="BUILD (SUCCESS|FAILURE)", timeout_ms=600000)` 阻塞等待。超时不算失败，先 `ps`/`lsof` 确认进程再决定。

5. 输出用中文；代码、标识符、命令、日志、错误信息、文件路径保持原样，不做翻译。
```

- [ ] **Step 3: 写 `rules/java-dev.md`**

标题为 `# Java 工程开发规则`，按顺序包含这几节，内容从 `/Users/lcssos/.config/opencode/AGENTS.md` 对应小节搬（保持原文措辞，不改技术细节）：

1. `## Maven：默认 mvnd` —— `mvnd` 示例、wrapper / 原生 mvn / 无 mvnd 三级例外、daemon 生命周期、`MVND_OPTS`。
2. `## 查证外部行为` —— 四级优先级，以及「读源码容易把某版本实现细节误当成行为契约」的理由。
3. `## 读第三方依赖源码` —— `unzip -p`、`unzip -l` 定位、解压到临时目录批量读、缺 `*-sources.jar` 时 `mvnd -o dependency:sources -DincludeArtifactIds=<artifactId>`、`javap -public` 仅签名、禁止 `javap -c`、1~2 次调用内解决。
4. `## 长任务与等待` —— `background: true` + 重定向 + `wait_for`；参数表（构建结束 / 端口起来 / 进程退出 / 旧匹配用 `must_be_new` / 大日志用 `tail_lines`）；`timeout_ms` 上限 600 秒；超时先 `ps`/`lsof`；`shell` 的 `timeout` 参数不可靠要用系统 `timeout`；`sleep` 只能是「等某个东西到来」的语义。
5. `## 语言约定` —— 中文思考与输出、代码与专有名词不翻译。

- [ ] **Step 4: 写 `package.json`**

```json
{
  "name": "opencode-agents-java-v2",
  "version": "0.1.0",
  "description": "OpenCode V2 plugin: Java 工程开发规则——mvnd 优先、文档优先查证、sources.jar 读法、wait_for 长任务等待",
  "type": "module",
  "exports": {
    ".": "./index.ts"
  },
  "files": [
    "index.ts",
    "rules",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "test": "bun test",
    "check": "bun build index.ts --target=node --outfile=/tmp/agents-java-check.js",
    "release": "./scripts/release.sh"
  },
  "engines": {
    "node": ">=22.14.0"
  },
  "keywords": [
    "opencode",
    "opencode-plugin",
    "opencode-v2",
    "java",
    "maven",
    "mvnd",
    "agents-md"
  ],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/lcssos/opencode-agents-java-v2.git"
  },
  "homepage": "https://github.com/lcssos/opencode-agents-java-v2#readme",
  "bugs": {
    "url": "https://github.com/lcssos/opencode-agents-java-v2/issues"
  }
}
```

- [ ] **Step 5: 写 `test/rules.test.ts`**

```ts
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
```

- [ ] **Step 6: 写 `.gitignore` 与 `LICENSE`**

`.gitignore`：`node_modules/`、`dist/`、`*.tgz`、`*.log`、`.DS_Store`。
`LICENSE`：MIT 全文，版权行 `Copyright (c) 2026 lcssos`（与相邻仓库一致）。

- [ ] **Step 7: 跑测试**

Run: `bun test`
Expected: 5 pass

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: 规则文件与仓库骨架"
```

---

### Task 2: 核心条款注入

**Files:**
- Create: `index.ts`
- Test: `test/plugin.test.ts`

**Interfaces:**
- Consumes: `rules/compact.md`（Task 1）。
- Produces: `export default { id: "agents-java", setup(ctx) }`；`setup` 调用 `ctx.session.hook("context", cb)`，`cb(event)` 在 `event.system` 末尾 push `{ type: "text", text: COMPACT }`。

- [ ] **Step 1: 写 `test/plugin.test.ts`**

```ts
import { describe, expect, test, beforeAll } from "bun:test"
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test test/plugin.test.ts`
Expected: FAIL，`Could not resolve "../index.ts"`

- [ ] **Step 3: 写 `index.ts` 的注入部分**

文件顶部注释说明「为什么」：规则拆成常驻核心 + 按需 skill，是为了不让每条 session 都背几千字。

```ts
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const MARKER = "<!-- opencode-agents-java-v2:injected -->"

/** 读不到就是打包漏了 rules/，直接抛错，不要静默注入空串。 */
function loadRule(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./rules/${name}`, import.meta.url)), "utf8")
}

const COMPACT = loadRule("compact.md")

export default {
  id: "agents-java",
  async setup(ctx: any) {
    const registration = await ctx.session.hook("context", (event: any) => {
      const injected = event.system.some((part: any) => part.type === "text" && part.text.startsWith(MARKER))
      if (injected) return
      event.system.push({ type: "text", text: COMPACT })
    })
    return () => void registration?.dispose?.()
  },
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test test/plugin.test.ts`
Expected: 4 pass

- [ ] **Step 5: 校验可构建**

Run: `bun build index.ts --target=node --outfile=/tmp/agents-java-check.js`
Expected: 成功输出产物路径，无 unresolved import

- [ ] **Step 6: Commit**

```bash
git add index.ts test/plugin.test.ts
git commit -m "feat: 每轮注入 Java 开发核心条款"
```

---

### Task 3: 注册 java-dev skill

**Files:**
- Modify: `index.ts`（`setup` 内追加 skill 注册）
- Modify: `test/plugin.test.ts`（追加 skill 断言）

**Interfaces:**
- Consumes: `rules/java-dev.md`（Task 1）、Task 2 建好的假 ctx 与 `contextHook`。
- Produces: skill `{ id: "java-dev", name: "Java 工程开发规则", description, path, content, autoinvoke: true }`。

- [ ] **Step 1: 追加失败测试**

顶部 import 补一行：

```ts
import { readFileSync } from "node:fs"
```

`test/plugin.test.ts` 末尾加：

```ts
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
    const event = { system: [] as any[] }
    await contextHook(event)
    expect(skill.content.length).toBeGreaterThan(event.system[0].text.length * 2)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test test/plugin.test.ts`
Expected: FAIL，`skill` 为 `undefined`

- [ ] **Step 3: 在 `index.ts` 里加 skill 注册**

补两行常量：

```ts
const FULL = loadRule("java-dev.md")
const SKILL_PATH = fileURLToPath(new URL("./rules/java-dev.md", import.meta.url))
```

`setup` 里 hook 注册之后追加：

```ts
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
```

cleanup 改为同时 dispose 两者：

```ts
return () => {
  void registration?.dispose?.()
  void skillRegistration?.dispose?.()
}
```

- [ ] **Step 4: 跑全量测试**

Run: `bun test`
Expected: 9 pass

- [ ] **Step 5: Commit**

```bash
git add index.ts test/plugin.test.ts
git commit -m "feat: 注册 java-dev skill 承载完整规则"
```

---

### Task 4: 发版流程与 README

**Files:**
- Create: `scripts/release.sh`、`.github/workflows/ci.yml`、`.github/workflows/publish.yml`、`README.md`
- Test: 无单测，靠 Step 4 的命令校验

**Interfaces:**
- Consumes: `package.json`（Task 1）、`index.ts`（Task 2/3）。
- Produces: `./scripts/release.sh <patch|minor|major|X.Y.Z>`；CI 在 push/PR 上跑 `bun test` + build + pack 校验。

- [ ] **Step 1: 抄发版脚本**

整份复制 `/Users/lcssos/wks/github/opencode-wait-for-v2/scripts/release.sh`，只改结尾 echo 的包名与 URL：

```bash
echo "包地址:   https://www.npmjs.com/package/opencode-agents-java-v2"
```

然后 `chmod +x scripts/release.sh`。

- [ ] **Step 2: 抄 CI 与 publish workflow**

复制 `opencode-wait-for-v2/.github/workflows/{ci.yml,publish.yml}`，把 `index.ts` 路径与包名替换为本项目，并在 CI 里加一步「规则文件必须在包里」：

```yaml
      - name: 确认 rules 进入发布清单
        run: |
          npm pack --dry-run --json 2>/dev/null | tee /tmp/pack.json
          for f in rules/compact.md rules/java-dev.md; do
            grep -q "\"$f\"" /tmp/pack.json || { echo "::error::$f 未进入 npm 包"; exit 1; }
          done
```

- [ ] **Step 3: 写 README**

章节顺序：解决什么问题（常驻几千字 vs 约 400 token + 按需 skill）→ 安装（`opencode plugin add opencode-agents-java-v2`，或写进 `opencode.jsonc` 的 `plugins`）→ 装了之后 agent 会遵守什么（四条硬约束）→ 规则文件在哪、怎么改 → 不做什么（不改写命令、不接管 AGENTS.md、不碰 LSP）→ 附录：本机安装软件不用 brew（官方 dmg/pkg 或应用自带更新器）→ 发版流程（首次发布需在 npm 配 Trusted Publisher）。

- [ ] **Step 4: 全量校验**

Run: `bun test && bun build index.ts --target=node --outfile=/tmp/agents-java-check.js && npm pack --dry-run`
Expected: 测试全绿；构建成功；pack 清单含 `index.ts`、`rules/compact.md`、`rules/java-dev.md`、`README.md`、`LICENSE`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: 补齐发版脚本、CI 与 README"
```

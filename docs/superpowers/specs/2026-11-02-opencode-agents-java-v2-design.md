# opencode-agents-java-v2 设计

- 日期：2026-11-02
- 状态：待确认

## 要解决的问题

全局 `~/.config/opencode/AGENTS.md` 里有一批「写 Java / 做构建 / 查第三方库」时才会用到的强制规则，但这些规则的问题不是内容不好，而是：

1. **全量常驻**。每条 session 都带着「查证优先级」「sources.jar 怎么读」「wait_for 参数表」这些几千字的细则，而多数 session 根本不碰 Maven 和 jar。
2. **无法分发**。它只活在本机一个 Markdown 文件里，换机器、给别人、版本回溯都靠手工复制。
3. **细则容易忘**。像「`javap` 只能看签名不能反汇编」「`mvnd` 改过 properties 必须 `--stop`」这种，模型不会主动去翻 AGENTS.md 的第二层。

所以做一个 npm 插件：把规则从「一份大 Markdown」拆成「常驻一小段核心 + 按需一份完整 skill」，并且让规则本身成为可版本化、可发布的产物。

## 目标

- 每个 session 自动带上一段**不超过 30 行**的核心条款，覆盖最容易踩的坑。
- 完整规则作为**一个 skill** 注册，模型判断相关时自动 invoke，也能被用户手动点名。
- 规则原文放在仓库 `rules/*.md`，纯 Markdown，不装插件的人也能直接 `cp` 走。
- 沿用现有 `opencode-wait-for-v2` 的工程形态：`@opencode/plugin`、bun test、tag 触发 npm OIDC 发布。

## 非目标

- **不做命令改写**（不把用户的 `mvn` 偷偷换成 `mvnd`）。静默改写用户输入的命令属于越权，出问题极难定位。
- **不做 Java 语法检查、不动 LSP/formatter**。
- **不接管 `AGENTS.md`**。插件只追加系统提示，不读写用户本机的 `AGENTS.md`。
- 不覆盖「软件安装不用 brew」那类纯环境管理条款（只在 README 附录保留，不进注入内容）。

## 方案

### 方案 A：精简注入 + 全量 skill（选定）

`ctx.session.hook("context")` 每次模型调用前往 `event.system` 追加一段固定文本；`ctx.skill.transform` 注册 `java-dev` skill 装完整规则。

- 常驻成本约 400 token，细则按需拉。
- 缺点：模型可能不 invoke skill。用「核心条款里点名『细节见 java-dev skill』」缓解。

### 方案 B：全量自动注入

把整份 AGENTS.md 塞进每一轮。

- 简单、绝不漏，但每 session 多几千 token，且和用户已有的全局 AGENTS.md 大面积重复。

### 方案 C：只注册 skill

- 零常驻成本，但模型不问就不看，等于没装。最容易被「我以为它会遵守」误导。

选 A：唯一同时满足「省 token」和「规则真的生效」的形态，代价（可能不 invoke）有明确的缓解手段。

## 怎么实现

### 包结构

```
opencode-agents-java-v2/
├── index.ts                  # server 入口：注入 + 注册 skill
├── rules/
│   ├── compact.md            # 常驻注入的 25~30 行核心条款
│   └── java-dev.md           # skill 正文（完整规则）
├── test/plugin.test.ts       # 纯逻辑测试，不依赖真实 OpenCode
├── scripts/release.sh        # 照抄 wait-for 的发版脚本
├── .github/workflows/{ci,publish}.yml
├── package.json              # name: opencode-agents-java-v2
├── README.md
└── docs/superpowers/specs/2026-11-02-opencode-agents-java-v2-design.md
```

### 注入

```ts
await ctx.session.hook("context", (event) => {
  event.system.push({ type: "text", text: COMPACT })
})
```

- `context` hook 只跑 agent loop，不污染 compaction / title / generate。
- 文本来自 `rules/compact.md`，运行时用 `new URL("../rules/compact.md", import.meta.url)` 读；读不到时回退到内联常量，避免打包差异导致静默失效。
- 内容幂等：同一段文本被追加多次不重复追加（按首行标记判断）。

### skill

```ts
await ctx.skill.transform((editor) => {
  editor.add({
    id: "java-dev",
    name: "Java 工程开发规则",
    description: "写 Java / 跑 Maven / 查第三方库 / 等长任务时必读：mvnd、文档优先、sources.jar、wait_for",
    path: rulesPath("java-dev.md"),
    content: FULL,
    autoinvoke: true,
  })
})
```

`path` 指向包内真实文件路径，`content` 是同一份内容（OpenCode 两者取其一加载，二者都给出）。

### 规则内容（从全局 AGENTS.md 提炼）

`rules/compact.md` 保留四条硬约束，每条 3~6 行：

1. **Maven 用 `mvnd`**：含 wrapper / 原生 mvn 的例外、daemon 生命周期、`MVND_OPTS`。
2. **先查文档再读源码**：官方文档 → GitHub issue → 实测 → 源码。
3. **读 jar 用 `*-sources.jar`**：`unzip -p`、`unzip -l` 定位、`javap -public` 只看签名、禁止 `javap -c` 反推实现、1~2 次调用内解决。
4. **长任务用 `wait_for`**：`background: true` + 日志重定向 + 一次阻塞等待，禁止 `sleep N; tail`。

`rules/java-dev.md` 在此之上补：参数表、超时不是失败的处理、`-o` 离线、`mvnd` 与 wrapper 的选择顺序、语言/命名约定（输出中文、代码与标识符不翻译）。

### 测试

`test/plugin.test.ts` 用假 ctx（`session.hook` / `skill.transform` 收集注册物），断言：

- `context` hook 注册成功，且追加的 system part 含四条关键词（`mvnd`、`sources.jar`、`wait_for`、文档优先级）。
- 重复调用不产生重复注入。
- skill 的 `id` / `autoinvoke` / `content` 非空，`content` 长度 > `compact` 长度（确认二者没写反）。
- `rules/*.md` 文件都能读到（防止 `files` 漏配）。

### 发版

与 `opencode-wait-for-v2` 一致：`./scripts/release.sh patch` → 改版本 → tag `v*` → GitHub Actions OIDC 发布。README 写明 npm 上是首次发布，需在 npm 后台配 Trusted Publisher。

## 留给实现者的决定

- `compact.md` 的具体措辞与顺序。
- 注入用了 hook 还是 hook + session instruction entry（先用纯 hook，简单且可控）。
- 插件 options 是否暴露（初版不暴露，保持零配置）。

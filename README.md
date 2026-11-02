# opencode-agents-java-v2

OpenCode **V2** 插件：把 Java / Maven 开发的硬约束交给 agent —— 每轮注入一小段核心条款，完整细则按需加载成一个 skill。

```text
Maven 用 mvnd · 查外部行为先查文档 · 读 jar 只看 sources.jar · 长任务用 wait_for
```

## 解决什么问题

写 Java 的人踩的坑高度集中在四个地方，而且都很贵：

1. 敲了 `mvn` 而不是 `mvnd`，一次构建多花几十秒。
2. 遇到「这个框架到底怎么做的」，直接去翻源码，把某个版本的实现细节当成框架契约，给出过度绝对的结论。
3. 为了确认一个方法签名，`find` + `javap` + `unzip` 反复试探十几次。
4. 长构建用 `sleep 60; tail ...` 轮询，一条任务白等十几分钟。

如果把这些规则写进 `AGENTS.md`，代价是**每条 session 都带着一整篇细则**——包括那些根本不碰 Maven、不查 jar 的 session。这份细则几千字，常驻成本远高于它带来的收益。

所以拆成两层：

| 层 | 内容 | 什么时候进上下文 |
| --- | --- | --- |
| 常驻注入 | `rules/compact.md`，五条硬约束，约 500 token | 每轮模型调用 |
| skill `java-dev` | `rules/java-dev.md`，完整细则（参数表、示例、例外） | 模型判断相关时自动拉取，也可手动点名 |

## 安装

```bash
opencode plugin add opencode-agents-java-v2
```

或者写进 `opencode.jsonc`：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-agents-java-v2"]
}
```

装完不需要重启，OpenCode 会热加载插件。

## 装了之后 agent 会遵守什么

- **Maven 一律 `mvnd`**：`mvnd -o test`、`mvnd -o -DskipTests package`。项目文档里写的 `mvn ...` 执行时替换。例外是项目带 Maven Wrapper（用 `./mvnw`）、需要对照原生 Maven（用 `/usr/local/bin/mvn`）、机器没装 `mvnd`（回退 `mvn`）。
- **查外部行为先查文档**：官方文档 → GitHub issue/PR → 最小复现实测 → 最后才是 `*-sources.jar`。
- **读 jar 只读 `*-sources.jar`**：`unzip -p` 取单个文件；`javap` 只允许 `-public` 看签名，禁止 `javap -c` 反汇编去反推实现。
- **长任务不要 sleep 轮询**：`wait_for` 工具可用时用「后台启动 + 一次阻塞等待」；不可用时退化为长间隔检查，而不是每 10 秒一次。

## 与其它 java-* skill 的分工

本插件只管**构建与查证**：Maven/mvnd、怎么确认第三方库的真实行为、怎么读 jar、怎么等长构建。

单元测试写法看 `java-junit`，Javadoc 规范看 `java-docs`，Spring Boot 用法看 `java-springboot`。skill 的 `description` 里已经写明这条边界，避免几个 skill 在同一句请求上互相抢 auto-invoke。

## 装了之后建议精简 `AGENTS.md`

如果你本机的 `~/.config/opencode/AGENTS.md`（或项目里的）已经写了一遍 `mvnd`、`sources.jar`、`wait_for` 的细则，**装完建议把这些章节删掉**，只留插件不覆盖的东西（语言约定、软件安装不用 brew 等）。

不删的后果是每个 session 同时背着「AGENTS.md 全量 + 插件 400 token + 按需 skill」，比原来更重；而且两处规则会各自演化，迟早对不上。

安全做法：先备份，再按 `rules/compact.md` 的层级对照删——细则都搬到插件里了，AGENTS.md 里只需要保留「本机特定、不适合分发」的部分。

## 改规则

规则是纯 Markdown，改文件就行，不用动 TypeScript：

- `rules/compact.md` —— 常驻注入的内容。**第一行必须是 `<!-- opencode-agents-java-v2:injected -->`**，插件靠它做幂等判断，改成别的会导致重复注入。
- `rules/java-dev.md` —— skill 正文，随便加。

改完跑 `bun test`，测试会检查标记行、关键条款是否还在、两份文件长度比例、以及 `package.json` 的 `files` 是否带上 `rules`。

不装插件、只想抄规则的话，直接 `cp rules/*.md` 走。

## 不做什么

- **不改写你的命令**。你敲 `mvn` 就是 `mvn`，插件只注入提示。静默替换用户输入属于越权，出问题极难定位。
- **不接管 `AGENTS.md`**。不读、不写、不覆盖你本机的全局或项目规则文件。它注入的是一段带标记的 system part，与已有内容共存。
- **不碰 LSP / formatter / Java 语法检查**。

## 附录：本机安装软件不用 brew

这条偏环境管理，不进 agent 的注入内容，但同属本机约定：

- 安装任何软件都不得使用 `brew` / Homebrew（含 `brew install`、`--cask`、`tap`），也不要用 brew 更新或卸载。
- 改用官方渠道：下载官方 `.dmg` / `.pkg` / `.tar.gz` 后挂载复制到 `/Applications`、官方安装脚本，或应用自带的更新器（如 JetBrains Toolbox）。
- 文档里写着 `brew install xxx` 的步骤，执行时改成等价的官方安装方式。
- 例外：用户明确要求用 brew 时按用户要求执行。

## 发版

```bash
./scripts/release.sh patch    # 0.1.0 → 0.1.1
./scripts/release.sh minor    # 0.1.1 → 0.2.0
./scripts/release.sh 1.2.3    # 指定版本
```

脚本会：校验工作区干净且在 `main` 上 → 跑 `bun test` → 改版本 → 提交 → 打 tag → 推送。推送 tag 触发 GitHub Actions（`.github/workflows/publish.yml`），用 OIDC trusted publishing 发布到 npm，不需要任何 npm token。

**首次发布必须先手工做一次**。npm 的 Trusted Publisher 配置入口在「已存在的包」的设置页，包还不存在时无处配置，所以顺序只能是：

1. 本地（或任意有 2FA 的机器）跑一次 `npm publish --access public` 发布 `0.1.0`。这一步走传统 2FA 认证，不用 token 文件。
2. 包在 npm 上出现后，进 Package → Settings → Trusted publishing，填 GitHub 用户 `lcssos`、仓库 `opencode-agents-java-v2`、workflow 文件名 `publish.yml`。
3. 之后 `./scripts/release.sh` 推的 tag 才会走 OIDC。**注意 npm 要求新配置在 2 天内完成首次成功发布，否则配置过期作废**，所以第 2、3 步最好连在一起做。

`package.json` 的 `repository.url` 必须与 GitHub 仓库精确匹配，否则 OIDC 发布报 `ENEEDAUTH`。

CI（`.github/workflows/ci.yml`）在 push / PR 上跑 `bun test` + `bun build` + `npm pack --dry-run`，并额外校验 `rules/*.md` 确实进了包——这一条是防止用户装完之后 skill 的 `path` 指向不存在的文件。

## 关于运行环境

`exports` 直接指向未编译的 `index.ts`，是 V2 插件的约定：OpenCode 用内嵌 bun 加载插件，不经过裸 Node。`engines.node >= 22.14.0` 对应的是 npm OIDC 发布的要求，不代表可以用裸 Node `import` 本包。

## 许可

MIT

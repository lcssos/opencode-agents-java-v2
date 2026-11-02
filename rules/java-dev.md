# Java 工程开发规则

本文件是 skill `java-dev` 的正文，也是 `rules/compact.md` 那份摘要的完整版。常驻注入只带摘要，需要细节时读这里。

## Maven：默认 mvnd

编译、测试、打包等一切 Maven 操作，**默认使用 `mvnd`**（Apache Maven Daemon），不要默认敲 `mvn`。

- 例：`mvnd -o test`、`mvnd -o -DskipTests package`、`mvnd clean install -pl <module>`、`mvnd -o test -Dtest=XxxTest`。
- 本机 `mvnd` 为 1.0.6（内置 Maven 3.9.16、JDK corretto 21），参数与 `mvn` 兼容，`-o` 离线模式照常可用。
- 项目文档（各仓库的 `AGENTS.md` / `README` / 计划文件）里写的 `mvn ...` 示例，执行时按本规则换成 `mvnd`。
- 例外：项目自带 Maven Wrapper 且要求固定 Maven 版本时，用项目的 `./mvnw`；需要对照原生 Maven 定位构建差异时，用绝对路径 `/usr/local/bin/mvn`；若某台机器没有 `mvnd`，回退 `mvn`。
- `mvnd` 是常驻 daemon：`mvnd --status` 看状态，`mvnd --stop` 关停；改过 `~/.m2/mvnd.properties` 后必须 `mvnd --stop` 才生效。
- daemon 的 JVM 参数用 `MVND_OPTS`（`MAVEN_OPTS` 对 daemon 无效）。

## 查证外部行为

遇到「某个库 / 框架 / 服务器到底怎么做的」「某个默认值是什么」「为什么会这样」这类问题，按下面顺序找答案，**不要一上来就读源码**：

1. **官方文档**——首要。`docs.spring.io`、各项目参考文档、厂商手册、Javadoc。
2. **GitHub**——issue / PR / release notes / wiki。很多「为什么这样设计」「这个行为是不是 bug」只有 issue 讨论里有答案，文档查不到。
3. **实测验证**——写最小复现（抓包、打日志、对照两个版本），通常比读源码更快拿到可信结论，且不会被实现细节误导。
4. 以上都查不到，才读 `*-sources.jar`（见下一节）。

读源码的成本远高于查文档，而且容易把「某个版本的实现细节」误当成「框架的行为契约」，从而给出过度绝对的结论。

## 读第三方依赖源码

**这是上一节的第 4 步**。需要确认某个第三方库的类、方法、行为时，按下面顺序取信息，不要一上来就反汇编字节码。

1. **优先读 `*-sources.jar`**。`~/.m2/repository` 里通常已缓存大量 `*-sources.jar`，用 `unzip -p` 直接读单个源文件：

   ```bash
   JAR=$(find ~/.m2/repository/org/springframework/spring-web -name "spring-web-*-sources.jar" | sort | tail -1)
   unzip -p "$JAR" org/springframework/web/client/RestTemplate.java
   ```

   - `unzip -p` 里写的是 **jar 内部路径**（`org/.../Xxx.java`），不是文件系统路径。
   - 目录不确定时先 `unzip -l "$JAR" | grep -i 关键词` 定位，再 `unzip -p` 取内容。
   - 同一个 jar 要读多个类时，解压到临时目录一次性读更快：

     ```bash
     unzip -oq "$JAR" -d /tmp/src-xxx && grep -rn "关键词" /tmp/src-xxx
     ```

   - 版本不确定时用 `sort | tail -1` 取最新，或按 pom 声明的版本精确 `find -name "xxx-1.2.3-sources.jar"`。

2. **没有 `*-sources.jar` 时先尝试补下载**，而不是直接 javap：

   ```bash
   cd <模块目录> && mvnd -o dependency:sources -DincludeArtifactIds=<artifactId>
   ```

   离线拿不到时再进第 3 步。

3. **`javap` 只作最后手段，且只看签名**：`javap -public -classpath <jar> <全限定类名>`。
   - **尽量不要**用 `javap -c` / `javap -p -c` 之类反汇编字节码去"反推"实现或行为——既慢又容易误读，字节码不是给人看的。
   - 确实需要看实现细节但拿不到源码时，优先问用户要（在 IDE 里打开很快），或查官方文档 / 对应版本的 GitHub 源码。

4. 判断"有没有这个方法 / 这个重载 / 默认值"这类问题，先看 `*-sources.jar` 或官方 Javadoc；只有签名层面的确认才允许 `javap -public`。

目标是把"翻 jar"的成本控制在 1~2 次工具调用内，不要连续几十次 `find` + `javap` + `unzip` 反复试探。

## 长任务与等待

**不要用 `sleep N; tail ...` 这种前台轮询。** 它浪费的是双份时间：sleep 那几分钟纯白等，醒来后还要再推理一轮（本机实测这一轮 P50 约 14 秒），一条长任务往往要轮询十几次。

### 首选：后台启动 + `wait_for` 阻塞等待

前提是 `wait_for` 工具可用（来自插件 `opencode-wait-for-v2`）。不确定时先看工具列表；没有就按下面「没有 wait_for 时」的做法。

**第一步**，长任务用 `background: true` 启动，输出重定向到日志文件：

```bash
mvnd -o clean install > /tmp/build.log 2>&1   # background: true
```

**第二步**，用 `wait_for` 一次性等到结束，不要反复调：

```
wait_for(path="/tmp/build.log", pattern="BUILD (SUCCESS|FAILURE)", timeout_ms=600000)
```

条件成立立刻返回（实测 11MB 日志 3ms 命中），不会傻等到 timeout。返回内容就是日志尾部，不需要再 `tail`。

### 参数选择

| 场景 | 用法 |
|---|---|
| 等构建/测试结束 | `path` + `pattern="BUILD (SUCCESS\|FAILURE)"` |
| 等端口起来 | `path` + `pattern="listening on\|Started .* in .* seconds"` |
| 等后台进程退出 | `pid=<pid>`（可同时给 `path` 拿日志） |
| 日志里已有旧的匹配 | 加 `must_be_new=true`，只看调用之后新增的内容 |
| 大日志 | `tail_lines=30` 控制返回量 |

`timeout_ms` 默认 240 秒，上限 600 秒。**超时不是失败**：返回里会带 `[wait_for] timed out` 和进程状态，这时应先查 `ps` / `lsof` 确认任务是否还活着，而不是再调一次 `wait_for` 重复等待。

### 其他注意

- `shell` 工具的 `timeout` 参数**不可靠**（实测设定 60s 跑了 975s），需要硬时限时用系统的 `timeout` 命令，例如 `timeout 600 mvnd ...`。
- 确实需要 sleep 时，必须是「等某个东西到来」的语义，不要 `sleep 3` 这种纯粹为了保险的空等。

### 没有 `wait_for` 时

那个工具来自 `opencode-wait-for-v2`，不是 OpenCode 内置。没装时不要调用它，也不要退化成每 10 秒一次的短轮询：

- 用 `background: true` 启动任务并重定向日志。
- 隔一段足够长的时间（例如以 1~2 分钟为起点）看一次日志尾部与进程状态，用 `ps -Ao pid,etime,command | grep -E '[m]vnd'` 判断还活着没有。
- 判断标准是「日志最后一行是否在推进」，而不是「已经等了多久」。

## 语言约定

- 思考过程（reasoning）尽量使用中文。
- 面向用户的输出结果尽量使用中文：回答、说明、计划、总结、提问、任务清单、提交信息（commit message）等一律用中文。
- 代码本身、标识符、命令、日志、错误信息、文件路径、专有名词以及第三方库/API 的原始名称保持原样，不做强行翻译。
- 引用外部文档或错误原文时可直接保留原文，必要时再补中文说明。

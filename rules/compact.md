<!-- opencode-agents-java-v2:injected -->
## Java / Maven 工程硬约束

以下条款优先于一般习惯。细则见 skill `java-dev`。

1. **Maven 一律用 `mvnd`**，不要默认 `mvn`：`mvnd -o test`、`mvnd -o -DskipTests package`、`mvnd clean install -pl <module>`。项目文档里写的 `mvn ...` 执行时换成 `mvnd ...`。
   - 例外：项目带 Maven Wrapper 且要求固定版本时用 `./mvnw`；要对照原生 Maven 定位构建差异时用 `/usr/local/bin/mvn`；机器没有 `mvnd` 才回退 `mvn`。
   - `mvnd` 是常驻 daemon：改过 `~/.m2/mvnd.properties` 必须 `mvnd --stop` 才生效；daemon 的 JVM 参数用 `MVND_OPTS`（`MAVEN_OPTS` 对 daemon 无效）。

2. **查外部行为先查文档，不要一上来读源码**。顺序：官方文档 → GitHub issue/PR/release notes → 最小复现实测 → 最后才是 `*-sources.jar`。

3. **读第三方 jar 只读 `*-sources.jar`**：`unzip -p "$JAR" org/.../Xxx.java`；路径不确定先 `unzip -l "$JAR" | grep -i 关键词`。`javap` 只允许 `-public` 看签名，**禁止** `javap -c` 反汇编去反推实现。目标 1~2 次工具调用解决。

4. **长任务不要用 `sleep N; tail ...` 轮询**。若 `wait_for` 工具可用（装了 `opencode-wait-for-v2`）：用 `background: true` 启动并重定向到日志文件，再一次性 `wait_for(path=..., pattern="BUILD (SUCCESS|FAILURE)", timeout_ms=600000)` 阻塞等待；超时不算失败，先 `ps`/`lsof` 确认进程。没有 `wait_for` 时，用后台启动 + 拉长间隔的一次性检查，不要连续 `sleep` 短轮询。

5. 输出用中文；代码、标识符、命令、日志、错误信息、文件路径保持原样，不做翻译。

# dsh-unattended

给 DSH 的 **自动审查（Auto review）** 预设加一个「无人值守」开关：审查拒绝的调用**直接拒绝**，不再弹人工审批；审查同意的调用照常执行。人不在电脑前时，审批面板不会再一直挂着。

> 适用：[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 官方 `@deepseek-ai/dsh-experimental-auto-review` 预设。桌面版 / Web 版均可。

## 为什么

DSH 的自动审查预设会在每次工具调用前让 reviewer 判断：

- 同意 → 直接执行；
- 拒绝 → 在 `ask` 审批策略下弹出「等待审批」面板，等你点「允许一次」。

离开电脑时这个面板会长期阻塞。本插件把拒绝的去向从「问用户」改成「直接拒绝」，审查本身不变。

## 行为

| 状态 | 审查同意 | 审查拒绝 |
|---|---|---|
| 无人值守关闭（默认） | 执行 | 弹人工审批 |
| 无人值守开启 | 执行 | **直接拒绝，不弹审批** |

- 不是「不审查」，也不是「全部放行」：每次调用仍然先过 reviewer。
- 无人值守会关闭该会话的**所有**人工审批（`never`）。自动审查预设本身是全权限沙箱，实际只有 reviewer 拒绝会产生审批，所以等价于上面的表格。

## 安装

```sh
# 桌面版
dsh plugin --profile desktop add github:JHees/dsh-unattended

# Web 版
dsh plugin --profile web add github:JHees/dsh-unattended
```

装好后刷新页面（或重启 DSH）。插件只会在**自动审查模式**下出现开关。

也可以从本地目录安装：`plugin_manager` → `install_bundle`，target 指向本仓库目录。

卸载：`dsh plugin --profile desktop remove dsh-unattended`。

## 使用

- 输入框左下角、`自动审查 ⌄` 旁边多一个月亮按钮：
  - 「无人值守」= 关闭；点一下变成高亮「无人值守中」= 开启。
- 命令行等价入口（任意客户端可用）：

  ```
  /unattended on     开启
  /unattended off    关闭
  /unattended        查看当前状态
  ```

- 状态按会话保存在该会话日志的 `approval/policy` 事件里，刷新、重启后保留。
- 切换权限预设会重写审批策略，因此无人值守会自动关闭；重新打开即可。

## 原理

1. 开关等价于把当前会话的审批策略设为 `never`（`ctx.approval.setPolicy`）。
2. 自动审查的 gate 由预设身份驱动，`never` 下仍判定为 `auto`，所以 reviewer 每次照常运行：
   - reviewer `allow` → 工具直接执行；
   - reviewer `deny` 且策略为 `never` → 返回最终拒绝（`AUTO_REVIEW_DENIED`），**不发起审批请求**；
   - 只有策略为 `ask` 时，拒绝才会弹面板。
3. 插件注册一个 `unattended` 会话投影（布尔）供按钮显示，状态本身不额外持久化。

## 已知限制

- 只在自动审查预设下可用；其它权限模式下按钮隐藏，`/unattended on` 会报错提示先切到自动审查。
- 依赖 `approval/policy` 事件与 Auto review 的既有行为；DSH 升级后若自动审查语义变化，本插件需要跟进。
- 未发布到 npm，只通过 GitHub 分发。

## 与已有插件的关系

社区里已有不少审批相关插件，但没有找到与本插件完全同构的实现，因此单独发布：

- **dsh-auto-classifier**：自带规则引擎 + LLM 分类器（外加 git 快照、状态页），等于换一套决策层；本插件不引入第二个判断器，只改「拒绝之后找不找用户」。
- **dsh-approval-mode**：同样是输入框旁的模式开关，但方向相反——自动**批准**，不审查。
- **@aiwayds/dsh-approval-policy**：给无人值守的审批请求加有界应答窗口、超时 fail-closed；解决「无限挂起」，不改变 reviewer 拒绝的去向。
- **dsh-auto-review / dsh-auto-reviewer / dsh-auto-pass / dsh-auto-approval-llm / dsh-auto-approve**：面向审批请求的自动审查器，风险项通常仍交给人。
- **dsh-unattended-supervisor**：无人值守时推进任务进度，明确不处理审批。
- **dsh-plugin-auto-answer**：自动回答 `ask_user_question`，不是审批链路。

## 开发

```sh
node test.mjs          # 主机逻辑：投影折叠、命令开/关与守卫
node test-client.mjs   # 客户端接线：槽位注册、按钮渲染与命令调用
```

仓库结构：

```
index.js             Host 插件（投影 + /unattended 命令）
client.js            Web 客户端（输入框开关）
cordis.patch.yml     bundle patch
locale/{zh,en}.json  插件显示名称与描述
icon.svg             插件图标
```

## License

MIT

/**
 * dsh-unattended — 自动审查模式的「无人值守」开关。
 *
 * 背景：Auto review 预设下，reviewer 拒绝一次调用后走 `ask` 审批策略，会弹出
 * 人工审批面板；人不在电脑前时该面板会一直挂着。本插件把「无人值守」实现为
 * 审批策略 `never`：审批服务在派发任何应答者之前就确定性拒绝，因此 reviewer
 * 的拒绝直接成为最终拒绝，不再询问用户（auto-review 的既有分支：
 * `overrideOf(session) === 'never'` 时返回最终拒绝）。
 *
 * 状态直接来自会话日志里的 `approval/policy` 事件（审批服务自己写入），不需要
 * 额外持久化；`unattended` 投影把策略折叠成布尔视图，交给客户端按钮显示。
 */

export const name = 'dsh-unattended'

export const inject = ['approval', 'permissionPresets', 'sessionProjections']

/**
 * 极小的 schema 垫片：本地 bundle 以 link 安装时 Node 从工作区 realpath 解析，
 * 拿不到 profile 里的 zod；投影只对这两个 schema 调用 `parse`，所以手写校验。
 */
const policyState = {
  parse(value) {
    if (value === null || typeof value !== 'object') throw new TypeError('unattended: approval state must be an object')
    if (value.policy !== 'ask' && value.policy !== 'never') throw new TypeError('unattended: approval policy must be ask or never')
    return value
  },
}

const enabledView = {
  parse(value) {
    if (typeof value !== 'boolean') throw new TypeError('unattended: unattended view must be a boolean')
    return value
  },
}

export function apply(ctx) {
  const configured = () => ctx.approval.config.policy ?? 'ask'

  // 会话级状态：审批策略本身。`never` = 无人值守。
  ctx.sessionProjections.register({
    key: 'unattended',
    stateVersion: 1,
    stateSchema: policyState,
    init: () => ({ policy: configured() }),
    apply: (state, event) => event.type === 'approval/policy' ? { policy: event.data.policy } : state,
    wire: {
      viewSchema: enabledView,
      view: (state) => state.policy === 'never',
    },
  })

  ctx.inject(['commands'], (commandCtx) => {
    commandCtx.commands.register({
      definitionId: 'dsh-unattended',
      name: 'unattended',
      description: 'Toggle unattended mode for Auto review: denied calls become final with no approval prompt',
      input: { hint: '[on|off]' },
      handler: ({ agent, rawInput }) => {
        const mode = rawInput.trim().toLowerCase()
        const current = ctx.approval.overrideOf(agent.session) ?? configured()
        if (mode === '') return { kind: 'success', text: `unattended ${current === 'never' ? 'on' : 'off'}` }
        if (mode !== 'on' && mode !== 'off') return { kind: 'error', text: 'usage: /unattended [on|off]' }
        if (mode === 'on') {
          // 只作为自动审查的变体：切换预设会重写审批策略，两种状态不会互相打架。
          if (ctx.permissionPresets.current(agent.session) !== 'auto') {
            return { kind: 'error', text: 'unattended needs the Auto review preset: run /permission auto first' }
          }
          ctx.approval.setPolicy(agent, 'never')
        } else {
          ctx.approval.setPolicy(agent, 'ask')
        }
        return { kind: 'success', text: `unattended ${mode}` }
      },
    })
  })
}

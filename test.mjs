/**
 * One runnable check for dsh-unattended's host logic (projection fold, command,
 * and the model-facing runtime context).
 * Run: node dsh-unattended/test.mjs
 */
import assert from 'node:assert/strict'
import { apply, inject, name } from './index.js'

function harness({ policy = 'ask', preset = 'auto' } = {}) {
  const session = { policy: undefined, preset }
  const agent = { session }
  const calls = []
  let projection
  let command
  let context
  const ctx = {
    approval: {
      config: { policy },
      overrideOf: (s) => s.policy,
      setPolicy: (a, next) => {
        calls.push(next)
        a.session.policy = next
      },
    },
    permissionPresets: { current: (s) => s.preset },
    sessionProjections: {
      register: (definition) => {
        projection = definition
        return () => {}
      },
    },
    inject: (deps, callback) => {
      if (deps.includes('commands')) callback({ commands: { register: (definition) => (command = definition) } })
      if (deps.includes('systemPrompt')) callback({
        systemPrompt: {
          context: (definition) => (context = definition),
          getContextOrder: (orderName) => ({ APPROVAL_POLICY: 115 })[orderName],
        },
      })
    },
  }
  apply(ctx)
  return { session, calls, projection, command, context }
}

const { session, calls, projection, command, context } = harness()

assert.equal(name, 'dsh-unattended')
assert.deepEqual(inject, ['approval', 'permissionPresets', 'sessionProjections'])

// Projection: default from config, folds approval/policy, same reference otherwise.
assert.equal(projection.key, 'unattended')
assert.deepEqual(projection.init(), { policy: 'ask' })
const ask = projection.init()
assert.equal(projection.wire.view(ask), false)
const never = projection.apply(ask, { type: 'approval/policy', data: { policy: 'never' } })
assert.deepEqual(never, { policy: 'never' })
assert.equal(projection.wire.view(never), true)
assert.equal(projection.apply(never, { type: 'tool/result' }), never)
assert.equal(projection.stateSchema.parse(never).policy, 'never')

// Command: on requires Auto review, off clears, bad args report usage.
assert.equal(command.handler({ agent: { session }, rawInput: '' }).text, 'unattended off')
session.preset = 'workspace-write'
assert.equal(command.handler({ agent: { session }, rawInput: 'on' }).kind, 'error')
assert.deepEqual(calls, [])
session.preset = 'auto'
assert.equal(command.handler({ agent: { session }, rawInput: 'on' }).text, 'unattended on')
assert.deepEqual(calls, ['never'])
assert.equal(command.handler({ agent: { session }, rawInput: '' }).text, 'unattended on')
assert.equal(command.handler({ agent: { session }, rawInput: 'off' }).text, 'unattended off')
assert.deepEqual(calls, ['never', 'ask'])
assert.equal(command.handler({ agent: { session }, rawInput: 'maybe' }).kind, 'error')

// Model-facing context: sits right after the approval policy and only appears
// for an Auto-review session whose approval policy is never.
assert.equal(context.name, 'unattended:mode')
assert.equal(context.order, 115.5)
session.policy = 'never'
session.preset = 'auto'
assert.match(context.text({ agent: { session } }), /^Unattended mode is on: .*denial is final/)
assert.equal(context.text({}), '')
session.preset = 'workspace-write'
assert.equal(context.text({ agent: { session } }), '')
session.preset = 'auto'
session.policy = 'ask'
assert.equal(context.text({ agent: { session } }), '')
session.policy = undefined
const configDefault = harness({ policy: 'never' })
configDefault.session.preset = 'auto'
assert.match(configDefault.context.text({ agent: { session: configDefault.session } }), /Unattended mode is on:/)

console.log('dsh-unattended: all checks passed')

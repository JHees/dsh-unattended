/**
 * One runnable check for dsh-unattended's client wiring (slot entry + command call).
 * Run: node dsh-unattended/test-client.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const React = {
  createElement(type, props, ...children) {
    return { type, props: { ...props, children } }
  },
  useState(initial) {
    return [initial, () => {}]
  },
}

let loaded
globalThis.window = {
  __ModuleLoader__: {
    load(entry) {
      loaded = entry
    },
  },
}
new Function(readFileSync(new URL('./client.js', import.meta.url), 'utf8'))()

assert.equal(loaded.id, 'dsh-unattended')
const plugin = loaded.factory((id) => {
  if (id === 'react') return React
  throw new Error(`unexpected require(${id})`)
})

// apply() installs dictionaries, a stylesheet, and one composer slot entry.
const effects = []
let slot
const commands = []
const ctx = {
  effect(callback, label) {
    const dispose = callback()
    effects.push({ label, dispose })
  },
  locale: { register: () => () => {} },
  sessions: {
    binding(sessionId) {
      return {
        session: {
          command: async (line) => {
            commands.push({ sessionId, line })
            return { ok: true, value: { matched: true } }
          },
        },
      }
    },
  },
  slots: {
    inject(key, callback) {
      assert.equal(key, 'conversation.input.left')
      slot = callback()
      return () => {}
    },
    register(options, component) {
      return { options, component }
    },
  },
}
plugin.apply(ctx)

assert.equal(slot.options.name, 'conversation.input.left')
assert.equal(slot.options.id, 'unattended')
assert.equal(slot.options.locale, 'unattended')
const injected = slot.options.inject()
const Toggle = slot.component

const render = (unattended, permissionValue) =>
  Toggle({
    sessionId: 's1',
    t: (key) => key,
    useProjection: (key) => (key === 'unattended' ? unattended : permissionValue),
    applyUnattended: injected.applyUnattended,
  })

// Hidden without the capability, for absent permissions, and outside Auto review.
assert.equal(render(undefined, { currentValue: 'auto' }), null)
assert.equal(render(false, undefined), null)
assert.equal(render(false, { currentValue: 'workspace-write' }), null)

// Off → button shows the off label and switches on.
const off = render(false, { currentValue: 'auto' })
assert.equal(off.type, 'button')
assert.equal(off.props['aria-pressed'], false)
assert.deepEqual(off.props.children[1].props.children, ['label.off'])
off.props.onClick()
assert.deepEqual(commands.at(-1), { sessionId: 's1', line: '/unattended on' })

// On → highlighted and switches off.
const on = render(true, { currentValue: 'auto' })
assert.equal(on.props['aria-pressed'], true)
assert.match(on.props.className, /is-on/)
on.props.onClick()
assert.deepEqual(commands.at(-1), { sessionId: 's1', line: '/unattended off' })

// A failed command rejects with its code.
ctx.sessions.binding = () => ({
  session: { command: async () => ({ ok: false, error: { code: 'X', message: 'nope' } }) },
})
await assert.rejects(injected.applyUnattended('s1', 'on'), /X: nope/)

console.log('dsh-unattended client: all checks passed')

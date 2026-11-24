// assets/scalar-page.js — 페이지 안 OpenAPI 사본으로 Scalar 를 띄우는 설정과 Mermaid 플러그인을 본다.
//   cd tools/docs && node --test tests/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const code = readFileSync(fileURLToPath(new URL('../assets/scalar-page.js', import.meta.url)), 'utf8')

function load({ payload, scalar = true, mermaid, diagrams } = {}) {
  const listeners = {}
  const created = []
  const document = {
    addEventListener: (type, handler) => {
      listeners[type] = handler
    },
    getElementById: (id) => (id === 'spec' && payload ? { textContent: JSON.stringify(payload) } : null),
    createElement: (tag) => ({
      tag,
      attributes: {},
      setAttribute(name, value) {
        this.attributes[name] = value
      },
    }),
  }
  const window = {
    mermaid,
    FeatureDocsDiagrams: diagrams,
    matchMedia: () => ({ matches: false }),
    Scalar: scalar ? { createApiReference: (target, configuration) => created.push({ target, configuration }) } : undefined,
  }
  vm.runInNewContext(code, { window, document, console })
  listeners.DOMContentLoaded()
  return created
}

test('페이지 안 OpenAPI 사본을 content 로 넘기고 외부 전송 기능을 끈다', () => {
  const created = load({ payload: { openapi: '3.1.0', info: { title: 'x' } } })

  assert.equal(created.length, 1)
  const { target, configuration } = created[0]
  assert.equal(target, '#app')
  assert.equal(configuration.content.openapi, '3.1.0')
  assert.equal(configuration.sources, undefined)
  assert.equal(configuration.withDefaultFonts, false)
  assert.equal(configuration.telemetry, false)
  assert.equal(configuration.agent.disabled, true)
  assert.equal(configuration.mcp.disabled, true)
})

test('사본이 여러 문서면 sources 로 넘긴다', () => {
  const created = load({ payload: { sources: [{ title: 'a', content: {} }] } })

  assert.equal(created[0].configuration.sources.length, 1)
  assert.equal(created[0].configuration.content, undefined)
})

test('Scalar 가 없으면 아무것도 만들지 않는다', () => {
  assert.deepEqual(load({ payload: { openapi: '3.1.0' }, scalar: false }), [])
})

function markdownHook(created) {
  return created[0].configuration.plugins[0]().markdown
}

function codeBlock(text) {
  const pre = {
    replaced: null,
    replaceWith(node) {
      this.replaced = node
    },
  }
  return { pre, code: { textContent: text, parentElement: pre } }
}

test('Mermaid 플러그인이 설명 안 mermaid 코드 블록을 strict 로 그린 그림으로 바꾼다', async () => {
  const options = {}
  const mermaid = {
    initialize: (value) => Object.assign(options, value),
    render: async (id, text) => ({ svg: `<svg data-id="${id}">${text.length}</svg>` }),
  }
  const created = load({ payload: { openapi: '3.1.0' }, mermaid })
  const { pre, code: block } = codeBlock('sequenceDiagram\nA->>B: x')
  const element = { querySelectorAll: () => [block], contains: () => true }

  await markdownHook(created)({ element, signal: { aborted: false } })

  assert.equal(options.securityLevel, 'strict')
  assert.equal(pre.replaced.tag, 'figure')
  assert.equal(pre.replaced.className, 'feature-docs-mermaid')
  assert.match(pre.replaced.innerHTML, /^<svg data-id="feature-docs-mermaid-\d+">/)
})

test('취소된 렌더는 블록을 바꾸지 않는다', async () => {
  let rendered = 0
  const mermaid = {
    initialize: () => {},
    render: async () => {
      rendered += 1
      return { svg: '<svg/>' }
    },
  }
  const created = load({ payload: { openapi: '3.1.0' }, mermaid })
  const { pre, code: block } = codeBlock('graph TD; A-->B')
  const element = { querySelectorAll: () => [block], contains: () => true }

  await markdownHook(created)({ element, signal: { aborted: true } })

  assert.equal(rendered, 0)
  assert.equal(pre.replaced, null)
})

test('그린 그림에 사이트의 그림 보기 도구를 붙인다', async () => {
  const enhanced = []
  const mermaid = { initialize: () => {}, render: async () => ({ svg: '<svg/>' }) }
  const created = load({ payload: { openapi: '3.1.0' }, mermaid, diagrams: { enhance: (node) => enhanced.push(node) } })
  const { pre, code: block } = codeBlock('graph TD; A-->B')
  const element = { querySelectorAll: () => [block], contains: () => true }

  await markdownHook(created)({ element, signal: { aborted: false } })

  assert.equal(enhanced.length, 1)
  assert.equal(enhanced[0], pre.replaced)
})

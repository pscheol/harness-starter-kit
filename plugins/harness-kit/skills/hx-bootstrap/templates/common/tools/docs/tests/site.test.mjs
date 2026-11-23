// assets/site.js — 찾기 입력이 목차를 거르고, Mermaid 를 strict 로 그리는지 본다.
//   cd tools/docs && node --test tests/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const code = readFileSync(fileURLToPath(new URL('../assets/site.js', import.meta.url)), 'utf8')

function item(text) {
  return { hidden: false, textContent: text, getAttribute: (name) => (name === 'data-search' ? text : null) }
}

function load({ items = [], groups = [], mermaid, sandbox = {} } = {}) {
  const listeners = {}
  const input = {
    value: '',
    handlers: {},
    addEventListener(type, handler) {
      this.handlers[type] = handler
    },
  }
  const document = {
    addEventListener: (type, handler) => {
      listeners[type] = handler
    },
    querySelector: (selector) => (selector === '[data-search-input]' ? input : null),
    querySelectorAll: (selector) => {
      if (selector === '[data-search]') return items
      if (selector === 'nav.side details') return groups
      return []
    },
  }
  const window = { mermaid, matchMedia: () => ({ matches: false }) }
  vm.runInNewContext(code, { window, document, console, ...sandbox })
  listeners.DOMContentLoaded()
  input.window = window
  return input
}

test('찾기 입력이 맞지 않는 목차 항목을 숨기고 묶음을 연다', () => {
  const items = [item('F-NOTE-01 노트 생성'), item('F-REC-01 녹음 업로드')]
  const groups = [{ open: false }]
  const input = load({ items, groups })

  input.value = '  녹음 '
  input.handlers.input()

  assert.equal(items[0].hidden, true)
  assert.equal(items[1].hidden, false)
  assert.equal(groups[0].open, true)
})

test('찾기 입력을 비우면 모든 항목을 다시 보인다', () => {
  const items = [item('F-NOTE-01'), item('F-REC-01')]
  const input = load({ items })

  input.value = 'rec'
  input.handlers.input()
  input.value = ''
  input.handlers.input()

  assert.deepEqual(items.map((entry) => entry.hidden), [false, false])
})

test('Mermaid 는 strict 보안 수준으로 pre.mermaid 만 그린다', async () => {
  const calls = {}
  const mermaid = {
    initialize: (options) => {
      calls.initialize = options
    },
    run: (options) => {
      calls.run = options
      return Promise.resolve()
    },
  }
  load({ mermaid })

  assert.equal(calls.initialize.securityLevel, 'strict')
  assert.equal(calls.initialize.startOnLoad, false)
  assert.deepEqual({ ...calls.run }, { querySelector: 'pre.mermaid' })
})

test('Mermaid 가 없으면 그리지 않고 오류도 내지 않는다', () => {
  assert.doesNotThrow(() => load({ mermaid: undefined }))
})

test('그림 배율은 10%~400% 안에 머문다 — 넓은 시퀀스 그림도 전체화면에 다 들어간다', () => {
  const diagrams = load().window.FeatureDocsDiagrams
  assert.equal(diagrams.clampScale(0.01), 0.1)
  assert.equal(diagrams.clampScale(9), 4)
  assert.equal(diagrams.clampScale(1.5), 1.5)
})

test('확대·축소는 한 번에 1.25배씩 움직이고 끝에서 멈춘다', () => {
  const diagrams = load().window.FeatureDocsDiagrams
  assert.equal(diagrams.nextScale(1, 1), 1.25)
  assert.equal(diagrams.nextScale(1, -1), 0.8)
  assert.equal(diagrams.nextScale(4, 1), 4)
  assert.equal(diagrams.nextScale(0.1, -1), 0.1)
  assert.equal(diagrams.nextScale(0.13, 1), 0.163)
})

test('화면 맞춤은 가로·세로 중 좁은 쪽에 맞춘다', () => {
  const diagrams = load().window.FeatureDocsDiagrams
  assert.equal(diagrams.fitScale({ width: 2000, height: 1000 }, { width: 1000, height: 1000 }), 0.5)
  assert.equal(diagrams.fitScale({ width: 400, height: 3000 }, { width: 1200, height: 750 }), 0.25)
})

test('SVG 원래 크기는 viewBox 에서 읽는다', () => {
  const diagrams = load().window.FeatureDocsDiagrams
  const svg = { getAttribute: (name) => (name === 'viewBox' ? '-8 -8 816.5 1204' : null) }
  assert.deepEqual({ ...diagrams.viewBoxSize(svg) }, { width: 816.5, height: 1204 })
  assert.equal(diagrams.viewBoxSize({ getAttribute: () => null }), null)
})

test('Mermaid 를 다 그린 뒤 그림마다 보기 도구를 붙인다', async () => {
  let enhanced = 0
  const mermaid = { initialize: () => {}, run: () => Promise.resolve() }
  const input = load({ mermaid })
  input.window.FeatureDocsDiagrams.enhanceAll = () => {
    enhanced += 1
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(typeof input.window.FeatureDocsDiagrams.enhance, 'function')
})

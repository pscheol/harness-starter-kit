/* 기능 명세 사이트 스크립트. 그림(Mermaid)·그림 보기 도구·찾기만 한다. 외부 요청을 하지 않는다. */
(function () {
  'use strict'

  // ───────────── 그림 보기 도구(확대·축소·맞춤·전체화면) ─────────────
  var MIN_SCALE = 0.1
  var MAX_SCALE = 4
  var STEP = 1.25

  function clampScale(value) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
  }

  /** 한 단계 확대(+1)·축소(-1). 끝에서는 그대로 머문다. */
  function nextScale(current, direction) {
    return clampScale(Math.round((direction > 0 ? current * STEP : current / STEP) * 1000) / 1000)
  }

  /** 그림 원래 크기를 상자에 통째로 넣는 배율 — 가로·세로 중 좁은 쪽에 맞춘다. */
  function fitScale(size, box) {
    return clampScale(Math.min(box.width / size.width, box.height / size.height))
  }

  /** Mermaid SVG 의 원래 크기. viewBox 가 없으면 null(도구를 붙이지 않는다). */
  function viewBoxSize(svg) {
    var box = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number)
    if (box.length !== 4 || !(box[2] > 0) || !(box[3] > 0)) return null
    return { width: box[2], height: box[3] }
  }

  function button(label, text, action) {
    var element = document.createElement('button')
    element.type = 'button'
    element.className = 'diagram-button'
    element.setAttribute('aria-label', label)
    element.title = label
    element.textContent = text
    element.addEventListener('click', action)
    return element
  }

  /** 그린 그림(svg 를 품은 pre.mermaid 나 figure)에 보기 도구를 붙인다. 두 번 붙이지 않는다. */
  function enhance(target) {
    if (!target || target.closest('.diagram')) return
    var svg = target.querySelector('svg')
    var size = svg && viewBoxSize(svg)
    if (!size) return

    var figure = document.createElement('figure')
    figure.className = 'diagram'
    var tools = document.createElement('div')
    tools.className = 'diagram-tools'
    tools.setAttribute('role', 'toolbar')
    tools.setAttribute('aria-label', '그림 보기')
    var viewport = document.createElement('div')
    viewport.className = 'diagram-viewport'
    viewport.tabIndex = 0
    viewport.setAttribute('aria-label', '그림 — 더하기·빼기로 확대·축소, 0 맞춤, F 전체화면')
    var level = document.createElement('output')
    level.className = 'diagram-level'

    var scale = null // null = 칸 폭에 맞춤(Mermaid 기본)

    function shownScale() {
      var width = svg.getBoundingClientRect().width
      return width > 0 ? width / size.width : 1
    }

    function apply(value) {
      scale = value
      if (value === null) {
        svg.style.removeProperty('width')
        svg.style.removeProperty('max-width')
        svg.style.removeProperty('height')
        figure.classList.remove('is-zoomed')
      } else {
        svg.style.maxWidth = 'none'
        svg.style.width = Math.round(size.width * value) + 'px'
        svg.style.height = 'auto'
        figure.classList.add('is-zoomed')
      }
      level.textContent = Math.round((value === null ? shownScale() : value) * 100) + '%'
    }

    function zoom(direction, anchor) {
      var before = scale === null ? shownScale() : scale
      var after = nextScale(before, direction)
      if (after === before) return
      var point = anchor || { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }
      var ratio = after / before
      var left = (viewport.scrollLeft + point.x) * ratio - point.x
      var top = (viewport.scrollTop + point.y) * ratio - point.y
      apply(after)
      viewport.scrollLeft = left
      viewport.scrollTop = top
    }

    function fitToViewport() {
      var box = viewport.getBoundingClientRect()
      apply(fitScale(size, { width: Math.max(box.width - 32, 1), height: Math.max(box.height - 32, 1) }))
      viewport.scrollLeft = 0
      viewport.scrollTop = 0
    }

    function isFull() {
      return document.fullscreenElement === figure || figure.classList.contains('is-expanded')
    }

    function markFull(on) {
      fullButton.textContent = on ? '닫기 (Esc)' : '전체화면'
      fullButton.setAttribute('aria-label', on ? '전체화면 끝내기' : '전체화면')
      fullButton.title = fullButton.getAttribute('aria-label')
    }

    function enterFallback() {
      markFull(true)
      figure.classList.add('is-expanded')
      document.documentElement.classList.add('diagram-open')
      fitToViewport()
      viewport.focus()
    }

    function leave() {
      if (document.fullscreenElement === figure && document.exitFullscreen) {
        document.exitFullscreen()
        return
      }
      figure.classList.remove('is-expanded')
      document.documentElement.classList.remove('diagram-open')
      markFull(false)
      apply(null)
      fullButton.focus()
    }

    function toggleFull() {
      if (isFull()) return leave()
      if (figure.requestFullscreen) {
        figure.requestFullscreen().catch(enterFallback)
      } else {
        enterFallback()
      }
    }

    var fullButton = button('전체화면', '전체화면', toggleFull)
    tools.appendChild(button('축소', '−', function () { zoom(-1) }))
    tools.appendChild(level)
    tools.appendChild(button('확대', '+', function () { zoom(1) }))
    tools.appendChild(button('폭에 맞춤', '맞춤', function () { apply(null) }))
    tools.appendChild(fullButton)

    document.addEventListener('fullscreenchange', function () {
      if (document.fullscreenElement === figure) {
        markFull(true)
        fitToViewport()
        viewport.focus()
      } else if (!figure.classList.contains('is-expanded')) {
        markFull(false)
        apply(null)
      }
    })

    viewport.addEventListener('keydown', function (event) {
      if (event.key === '+' || event.key === '=') zoom(1)
      else if (event.key === '-' || event.key === '_') zoom(-1)
      else if (event.key === '0') apply(isFull() ? fitScale(size, viewport.getBoundingClientRect()) : null)
      else if (event.key === 'f' || event.key === 'F') toggleFull()
      else if (event.key === 'Escape' && isFull()) leave()
      else return
      event.preventDefault()
    })

    viewport.addEventListener(
      'wheel',
      function (event) {
        if (!(event.ctrlKey || event.metaKey)) return // 그냥 휠은 페이지·그림 스크롤
        event.preventDefault()
        var box = viewport.getBoundingClientRect()
        zoom(event.deltaY < 0 ? 1 : -1, { x: event.clientX - box.left, y: event.clientY - box.top })
      },
      { passive: false }
    )

    // 그림이 칸보다 크면 끌어서 옮긴다(스크롤 위치를 바꾼다).
    var drag = null
    viewport.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return
      if (viewport.scrollWidth <= viewport.clientWidth && viewport.scrollHeight <= viewport.clientHeight) return
      drag = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop }
      viewport.setPointerCapture(event.pointerId)
      figure.classList.add('is-dragging')
    })
    viewport.addEventListener('pointermove', function (event) {
      if (!drag) return
      viewport.scrollLeft = drag.left - (event.clientX - drag.x)
      viewport.scrollTop = drag.top - (event.clientY - drag.y)
    })
    function endDrag() {
      drag = null
      figure.classList.remove('is-dragging')
    }
    viewport.addEventListener('pointerup', endDrag)
    viewport.addEventListener('pointercancel', endDrag)

    target.parentNode.insertBefore(figure, target)
    viewport.appendChild(target)
    figure.appendChild(tools)
    figure.appendChild(viewport)
    apply(null)
  }

  function enhanceAll(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll('pre.mermaid'), function (pre) {
      if (pre.querySelector('svg')) enhance(pre)
    })
  }

  var diagrams = {
    clampScale: clampScale,
    nextScale: nextScale,
    fitScale: fitScale,
    viewBoxSize: viewBoxSize,
    enhance: enhance,
    enhanceAll: enhanceAll,
  }
  window.FeatureDocsDiagrams = diagrams

  // ───────────── Mermaid · 찾기 ─────────────
  function drawDiagrams() {
    if (!window.mermaid) return
    var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'neutral', fontFamily: 'inherit' })
    window.mermaid
      .run({ querySelector: 'pre.mermaid' })
      .then(function () {
        diagrams.enhanceAll(document)
      })
      .catch(function (error) {
        console.error('Mermaid 그림을 그리지 못했다', error)
      })
  }

  function wireSearch() {
    var input = document.querySelector('[data-search-input]')
    if (!input) return
    var items = Array.prototype.slice.call(document.querySelectorAll('[data-search]'))
    input.addEventListener('input', function () {
      var query = input.value.trim().toLowerCase()
      items.forEach(function (item) {
        var text = (item.getAttribute('data-search') || item.textContent || '').toLowerCase()
        item.hidden = query !== '' && text.indexOf(query) === -1
      })
      document.querySelectorAll('nav.side details').forEach(function (group) {
        if (query !== '') group.open = true
      })
    })
  }

  document.addEventListener('DOMContentLoaded', function () {
    drawDiagrams()
    wireSearch()
  })
})()

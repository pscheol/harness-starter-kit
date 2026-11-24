/*
 * 문서 사이트의 Scalar 페이지. OpenAPI 사본은 페이지 안 <script type="application/json" id="spec"> 에 있다(file:// 에서 fetch 가 막혀도 그린다).
 * featureMermaid 는 @scalar/mermaid-plugin 0.1.5(MIT)의 markdown 훅을 옮긴 것이다. import('mermaid') 대신 페이지가 먼저 읽은 전역 mermaid 를 쓴다.
 * 설명은 신뢰하지 않는 입력으로 보고 securityLevel 'strict' 로 그린다.
 */
(function () {
  'use strict'

  var count = 0
  var ready = false

  function renderer() {
    if (!window.mermaid) return null
    if (!ready) {
      var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, theme: dark ? 'dark' : 'neutral' })
      ready = true
    }
    return window.mermaid
  }

  function featureMermaid() {
    return function () {
      return {
        name: 'feature-docs-mermaid',
        extensions: [],
        markdown: async function (context) {
          var element = context.element
          var signal = context.signal
          var blocks = Array.prototype.slice.call(element.querySelectorAll('pre > code.language-mermaid'))
          var mermaid = renderer()
          if (!blocks.length || !mermaid || signal.aborted) return
          for (var i = 0; i < blocks.length; i++) {
            if (signal.aborted) return
            var pre = blocks[i].parentElement
            if (!pre || !element.contains(pre)) continue
            try {
              count += 1
              var result = await mermaid.render('feature-docs-mermaid-' + count, blocks[i].textContent || '')
              if (signal.aborted || !element.contains(pre)) continue
              var figure = document.createElement('figure')
              figure.className = 'feature-docs-mermaid'
              figure.setAttribute('data-markdown-block', '')
              figure.innerHTML = result.svg
              pre.replaceWith(figure)
              if (window.FeatureDocsDiagrams) window.FeatureDocsDiagrams.enhance(figure) // 사이트 그림 보기 도구(site.js)
            } catch (error) {
              console.error('Mermaid 그림을 그리지 못했다', error)
            }
          }
        },
      }
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var source = document.getElementById('spec')
    if (!source || !window.Scalar) return
    var payload = JSON.parse(source.textContent)
    var configuration = {
      plugins: [featureMermaid()],
      withDefaultFonts: false,
      hideClientButton: true,
      telemetry: false,
      showDeveloperTools: 'never',
      defaultOpenAllTags: false,
      layout: 'modern',
      agent: { disabled: true },
      mcp: { disabled: true },
    }
    if (payload.sources) {
      configuration.sources = payload.sources
    } else {
      configuration.content = payload
    }
    window.Scalar.createApiReference('#app', configuration)
  })
})()

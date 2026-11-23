# assets/vendor — S12 흐름 화면의 오프라인 번들

`S12-workflow.html`은 React Flow를 CDN 없이 이 폴더의 파일로만 그린다. 정적 http로 열면 된다(`file://`은 막힌다).

| 파일 | 내용 |
|---|---|
| `flow.bundle.js` | `../flow-src/*.jsx`(화면 코드 · 예시 데이터)와 React · React DOM · React Flow를 esbuild로 묶은 IIFE. 압축 526,807바이트, gzip 약 165KB. 오른쪽 판의 남은 Bolt 차트는 번들 밖 `../viz.js`(`window.HXViz`)가 그린다 |
| `flow.css` | `@xyflow/react/dist/style.css` 그대로. 모든 규칙이 `@layer xyflow` 안이라 `app.css`와 S12의 `<style>`이 덮어쓴다 |
| `THIRD-PARTY-LICENSES.txt` | 번들에 들어간 패키지의 라이선스 원문. 번들 끝에도 각 패키지의 라이선스 머리말이 남아 있다(`--legal-comments=eof`) |

## 들어간 패키지

esbuild metafile로 확인한 목록이다(2026-11-23 설치).

| 패키지 | 버전 | 라이선스 |
|---|---|---|
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| scheduler | 0.28.0 | MIT |
| react-compiler-runtime | 1.0.0 | MIT |
| @xyflow/react | 13.0.2 | MIT |
| @xyflow/system | 1.0.0 | MIT |
| zustand | 5.1.0 | MIT |
| classcat | 5.0.5 | MIT |
| d3-zoom | 3.0.1 | ISC |
| d3-drag | 3.0.1 | ISC |
| d3-selection | 3.0.1 | ISC |
| d3-transition | 3.0.2 | ISC |
| d3-interpolate | 3.0.2 | ISC |
| d3-color | 3.1.1 | ISC |
| d3-dispatch | 3.0.2 | ISC |
| d3-timer | 3.0.2 | ISC |
| d3-ease | 3.0.2 | BSD-3-Clause |

빌드 도구: esbuild 0.28.2(MIT). 번들에는 들어가지 않는다.

React Flow 표지("React Flow" 링크, 캔버스 왼쪽 아래)는 숨기지 않았다. 글자 크기만 12px로 맞췄다.

## 다시 빌드하기

빌드는 리포 밖 `/tmp/hk-flow-build`에서 한다. `node_modules`를 리포에 두지 않는다.

```sh
# 1) 한 번만: 같은 버전으로 설치
mkdir -p /tmp/hk-flow-build && cd /tmp/hk-flow-build
npm init -y
npm i react@19.3.1 react-dom@19.3.1 @xyflow/react@13.0.2 esbuild@0.28.2

# 2) 번들 · CSS 만들기(리포 루트를 REPO로)
REPO=/path/to/harness-starter-kit
S="$REPO/docs/design/screens/assets"
cd /tmp/hk-flow-build
NODE_PATH=/tmp/hk-flow-build/node_modules ./node_modules/.bin/esbuild "$S/flow-src/workflow.jsx" \
  --bundle --format=iife --minify --target=es2020,chrome100,firefox100,safari15 \
  --jsx=automatic --define:process.env.NODE_ENV='"production"' --legal-comments=eof \
  --outfile="$S/vendor/flow.bundle.js"
cp node_modules/@xyflow/react/dist/style.css "$S/vendor/flow.css"
```

`NODE_PATH`가 있어야 리포 안의 `flow-src/*.jsx`가 `/tmp`의 `node_modules`에서 `react` · `@xyflow/react`를 찾는다. 버전을 올리면 위 표와 `THIRD-PARTY-LICENSES.txt`를 같이 고친다.

## 화면 코드(`../flow-src/`)

| 파일 | 하는 일 |
|---|---|
| `workflow.jsx` | 진입점. `app.js`의 `hx:ready`에서 `flushSync`로 그린다(그래야 `?co=1` 영역 번호가 캔버스 안 요소를 찾는다). 맞추기 · URL 인자 · 상태 화면 |
| `data.js` | 예시 데이터: INT-7 · Unit 4개 · 여덟 단계 · 처리할 일 · 변경 제안(`?state=proposal`, units.proposed.json) |
| `layout.js` | 라이브러리 없는 자리 계산: 기능 Unit은 `dependsOn` 깊이로 열, 계약 Unit은 위 띠. 제안으로 더할 선 · 뺄 선 |
| `nodes.jsx` · `edges.jsx` | Intent 영역 · Unit 노드 · 게이트 레일, 의존 선(실선) · 계약 선(점선) · 제안 선(파란 점선) |
| `panel.jsx` | 오른쪽 판: Intent 요약(처리할 일 · 남은 일 차트 · Unit별 Bolt가 붙은 의존 순서, 제안이 있으면 제안 내용) 또는 고른 Unit의 상태 · 처리할 일 · 게이트 · 연결 · 행동 |
| `toolbar.jsx` · `states.jsx` | 거르기 줄 · 편집 도구줄 · 제안 띠 · 범례, 읽는 중 · 비어 있음 · 읽기 오류 |

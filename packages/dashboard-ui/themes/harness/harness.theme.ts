// The harness theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in harness.settings.json and the generated harness.settings.ts;
// change them with `astryx experimental theme editor set harness ...`. Add your own changes below: they win over the settings.
//
// HK-26: 바탕은 무채색(따뜻한 회색) + 강조색 하나(accent, 타는 주황). 의미 색(파랑 = 설계, 앰버 = 구현 · 검증, 청록 = 반영 · 운영 · 통과,
// 빨강 = 처리할 일 · 실패)은 작은 상태 칩 · 게이트 레일에만 낮은 채도로 쓴다(docs/design/screens 는 의미 색을 화면 전체에 썼다 — design.md 어긋남 표).
// accent · success · warning · danger · neutral 은 설정 파일(editor set)이 만들고, 아래 --hk-* 는 게이트 레일 · 막대처럼
// 컴포넌트에 없는 그림이 같은 색을 쓰게 하는 토큰이다. 이 토큰들은 색 한 값뿐이다(라이트가 기본이고 다크는 만들지 않는다 — 화면기획서 제외 범위). 외부 글꼴은 CSP(font-src 없음) 때문에 못 불러오므로 시스템 글꼴만 쓴다.
import {defineTheme} from '@astryxdesign/core/theme';
import {harnessSettings} from './harness.settings';

export const harnessTheme = defineTheme({
  extends: harnessSettings,
  name: 'harness',
  typography: {
    body: {
      family: 'system-ui',
      fallbacks:
        '-apple-system, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "Segoe UI", sans-serif',
    },
    heading: {
      family: 'system-ui',
      fallbacks:
        '-apple-system, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "Segoe UI", sans-serif',
    },
    code: {
      family: 'ui-monospace',
      fallbacks: '"SF Mono", Menlo, Consolas, "D2Coding", monospace',
    },
  },
  tokens: {
    '--hk-design': '#4a5fb8',
    '--hk-build': '#b07a1a',
    '--hk-ops': '#2f8a73',
    '--hk-gate': '#c0392b',
    '--hk-todo': '#87827c',
  },
});

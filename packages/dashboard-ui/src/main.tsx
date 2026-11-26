// 관리 페이지 진입. 토큰을 주소에서 옮기고 테마(light)로 감싼 틀을 #root 에 건다.
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import koKR from "@astryxdesign/core/locales/ko-KR.generated.js";
import { Theme } from "@astryxdesign/core/theme";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./css/main.css";
import { App } from "./App";
import { takeTokenFromHash } from "./lib/api";
import { applyPalette, storedPalette } from "./lib/palette";
import { harnessTheme } from "./themes/harness/harness";

takeTokenFromHash();
applyPalette(storedPalette());

const root = document.getElementById("root");
if (!root) throw new Error("#root 가 없습니다");
createRoot(root).render(
  <StrictMode>
    {/* astryx 부품 안의 글(파일 끌어다 놓기 · 닫기 · 선택 사항 등)도 한국어로 */}
    <InternationalizationProvider locale="ko-KR" messages={{ "ko-KR": koKR }}>
      <Theme theme={harnessTheme} mode="light">
        <App />
      </Theme>
    </InternationalizationProvider>
  </StrictMode>,
);

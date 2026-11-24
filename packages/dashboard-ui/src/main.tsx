// 관리 페이지 진입. 토큰을 주소에서 옮기고 테마(light)로 감싼 틀을 #root 에 건다.
import { Theme } from "@astryxdesign/core/theme";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./css/main.css";
import { App } from "./App";
import { takeTokenFromHash } from "./lib/api";
import { harnessTheme } from "./themes/harness/harness";

takeTokenFromHash();

const root = document.getElementById("root");
if (!root) throw new Error("#root 가 없다");
createRoot(root).render(
  <StrictMode>
    <Theme theme={harnessTheme} mode="light">
      <App />
    </Theme>
  </StrictMode>,
);

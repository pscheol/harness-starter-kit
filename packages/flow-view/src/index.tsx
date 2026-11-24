/**
 * 진입: `mount(el, props)` → `{ update, unmount }`. 전역 변수를 걸지 않는 ES 모듈이다.
 * 화면(`static/js/flowview.js`)이 흐름 보기를 열 때만 `import("/vendor/flow.bundle.js")` 로 불러온다.
 */
import "@xyflow/react/dist/style.css";
import "./flow.css";
import { createRoot } from "react-dom/client";
import { FlowView, type FlowViewProps } from "./FlowView";

export type { FlowViewProps } from "./FlowView";
export type { FlowData, FlowLabels } from "./types";

export interface Mounted {
  update(props: FlowViewProps): void;
  unmount(): void;
}

export function mount(el: HTMLElement, props: FlowViewProps): Mounted {
  const root = createRoot(el);
  root.render(<FlowView {...props} />);
  return {
    update: (next) => root.render(<FlowView {...next} />),
    unmount: () => root.unmount(),
  };
}

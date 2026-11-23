/* S12 진행 · 흐름 — React Flow(@xyflow/react, MIT) 시안.
 * 빌드: assets/vendor/README.md. app.js가 셸(레일 · 아이콘 · ?state=)을 만든 뒤
 * hx:ready에서 동기로 그려야 ?co=1 영역 번호가 캔버스 안 요소를 찾는다.
 */
import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  ControlButton,
  Panel,
  useNodesState,
  useReactFlow,
  useNodesInitialized
} from "@xyflow/react";

import { INTENT, UNITS, AREAS, STATE_FILTERS, PROPOSAL, matchesState, countBy } from "./data.js";
import { G, computeLayout, buildNodes, buildEdges, touchedByProposal } from "./layout.js";
import { NODE_TYPES, ViewCtx } from "./nodes.jsx";
import { EDGE_TYPES } from "./edges.jsx";
import { Toolbar, Legend, EditBar, ProposalBanner } from "./toolbar.jsx";
import { UnitDetail, IntentOverview } from "./panel.jsx";
import { LoadingCanvas, EmptyCanvas, ErrorCanvas } from "./states.jsx";

const ARIA = {
  "node.a11yDescription.default": "Enter나 Space로 Unit을 고른다. Esc로 고르기를 푼다.",
  "node.a11yDescription.keyboardDisabled": "Enter나 Space로 Unit을 고른다. Esc로 고르기를 푼다.",
  "node.a11yDescription.ariaLiveMessage": () => "",
  "edge.a11yDescription.default": "의존 선",
  "controls.ariaLabel": "화면 조절",
  "controls.zoomIn.ariaLabel": "확대",
  "controls.zoomOut.ariaLabel": "축소",
  "controls.fitView.ariaLabel": "전체 보기",
  "controls.interactive.ariaLabel": "잠금",
  "minimap.ariaLabel": "미니맵 · 누르거나 끌어 화면을 옮긴다",
  "handle.ariaLabel": "연결점"
};

/* 맞추기: 위에 붙이고 가로 가운데. 아래 띠는 미니맵 · 조절 단추 자리라 비워 둔다. */
const FIT_PAD = 28;
const FIT_BOTTOM = 128;
const NARROW = "(max-width: 1180px)";
const REVEAL_GAP = 16;
const DOCK_W = 320;
const MINIMAP_SIZE = { width: 176, height: 104 };
const MINIMAP_SMALL = { width: 144, height: 88 };
const MINIMAP_COLOR = { design: "#3046c5", build: "#c98a12", gate: "#c8102e", none: "#aeb9c7" };

function placeCallouts() {
  requestAnimationFrame(() => {
    if (window.__placeCallouts) window.__placeCallouts();
  });
}

function useMedia(query) {
  const get = () => typeof window !== "undefined" && window.matchMedia(query).matches;
  const [on, setOn] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const fn = () => setOn(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [query]);
  return on;
}

/** 영역(0,0 · layout 크기)을 캔버스 위쪽에 맞추는 viewport */
function fitViewport(box, layout, extraW) {
  const w = box.clientWidth + (extraW || 0);
  const h = box.clientHeight;
  const zoom = Math.max(0.4, Math.min(1, (w - FIT_PAD * 2) / layout.width, (h - FIT_PAD - FIT_BOTTOM) / layout.height));
  const slack = Math.max(0, h - FIT_PAD - FIT_BOTTOM - layout.height * zoom);
  return { x: Math.round((w - layout.width * zoom) / 2), y: Math.round(FIT_PAD + slack / 2), zoom };
}

/* 좁은 화면에서 판이 열려 있으면 판이 닫힌 넓이로 배율을 정한다(열고 닫아도 배율이 같다) */
function useFitTop(boxRef, layout, dockedRef) {
  const { setViewport } = useReactFlow();
  return useCallback(
    (duration) => {
      if (!boxRef.current) return Promise.resolve(false);
      const extra = dockedRef && dockedRef.current ? DOCK_W : 0;
      return setViewport(fitViewport(boxRef.current, layout, extra), duration ? { duration } : undefined);
    },
    [boxRef, layout, dockedRef, setViewport]
  );
}

/** 고른 노드가 캔버스 밖으로 잘리면 가로로 옮겨 가운데에 둔다(배율은 그대로) */
function useReveal(boxRef, selectedId) {
  const { getInternalNode, getViewport, setViewport } = useReactFlow();
  return useCallback(
    (duration) => {
      if (!selectedId || !boxRef.current) return;
      const n = getInternalNode(selectedId);
      if (!n) return;
      const vp = getViewport();
      const w = boxRef.current.clientWidth;
      const x0 = n.internals.positionAbsolute.x;
      const left = x0 * vp.zoom + vp.x;
      const right = (x0 + G.NODE_W) * vp.zoom + vp.x;
      if (left >= REVEAL_GAP && right <= w - REVEAL_GAP) return;
      const x = Math.round(w / 2 - (x0 + G.NODE_W / 2) * vp.zoom);
      setViewport({ ...vp, x }, duration ? { duration } : undefined).then(placeCallouts);
    },
    [boxRef, selectedId, getInternalNode, getViewport, setViewport]
  );
}

/** 처음 맞추기 · 크기가 바뀌면 다시 맞추기(사람이 움직이기 전까지) · 고른 노드 드러내기 · 영역 번호 다시 놓기 */
function FitKeeper({ boxRef, movedRef, layout, selectedId, narrow }) {
  const ready = useNodesInitialized();
  /* 좁은 화면에서 판이 열리면 캔버스가 좁아진다: 다시 맞추지 않고 고른 노드만 드러낸다 */
  const dockedRef = useRef(false);
  dockedRef.current = narrow && Boolean(selectedId);
  const fitTop = useFitTop(boxRef, layout, dockedRef);
  const reveal = useReveal(boxRef, selectedId);
  const revealRef = useRef(reveal);
  const fittedRef = useRef(false);
  revealRef.current = reveal;
  useLayoutEffect(() => {
    if (!ready) return;
    fitTop().then(() => {
      fittedRef.current = true;
      revealRef.current(0);
      placeCallouts();
    });
  }, [ready, fitTop]);
  useEffect(() => {
    if (fittedRef.current) reveal(240);
  }, [reveal]);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !window.ResizeObserver) return undefined;
    let t = 0;
    let last = el.clientWidth + "x" + el.clientHeight;
    const ro = new ResizeObserver(() => {
      const size = el.clientWidth + "x" + el.clientHeight;
      if (size === last) return;
      last = size;
      clearTimeout(t);
      t = setTimeout(() => {
        if (movedRef.current) placeCallouts();
        else if (dockedRef.current) {
          revealRef.current(200);
          placeCallouts();
        } else
          fitTop().then(() => {
            revealRef.current(0);
            placeCallouts();
          });
      }, 120);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [boxRef, movedRef, fitTop]);
  return null;
}

function FitButton({ boxRef, movedRef, layout }) {
  const fitTop = useFitTop(boxRef, layout);
  return (
    <ControlButton
      className="react-flow__controls-fitview"
      onClick={() => {
        movedRef.current = false;
        fitTop(240).then(placeCallouts);
      }}
      title="전체 보기"
      aria-label="전체 보기"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </ControlButton>
  );
}

function FlowCanvas({ units, layout, selectedId, onSelect, view, narrow, proposal }) {
  const boxRef = useRef(null);
  const movedRef = useRef(false);
  const [nodes, setNodes, onNodesChange] = useNodesState(buildNodes(INTENT, units, layout, selectedId, proposal));
  const edges = useMemo(() => buildEdges(units, layout, view, proposal), [units, layout, view, proposal]);

  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => (n.type !== "unit" || Boolean(n.selected) === (n.id === selectedId) ? n : { ...n, selected: n.id === selectedId }))
    );
  }, [selectedId, setNodes]);

  const shown = useMemo(
    () =>
      nodes.map((n) =>
        n.type === "unit" ? { ...n, domAttributes: { ...n.domAttributes, "aria-pressed": n.selected ? "true" : "false" } } : n
      ),
    [nodes]
  );

  const onSelectionChange = useCallback(
    ({ nodes: sel }) => {
      const u = sel.find((n) => n.type === "unit");
      onSelect(u ? u.id : null, "canvas");
    },
    [onSelect]
  );
  const onNodeClick = useCallback((_, n) => {
    if (n.type === "intent") onSelect(null, "canvas");
  }, [onSelect]);
  const onMoveStart = useCallback((e) => {
    if (e) movedRef.current = true;
  }, []);
  const minimapColor = useCallback((n) => (n.type === "intent" ? "#e2e7ef" : MINIMAP_COLOR[n.data.unit.status.tone]), []);

  return (
    <div className="f-flow" ref={boxRef}>
      <ReactFlow
        nodes={shown}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onSelectionChange={onSelectionChange}
        onNodeClick={onNodeClick}
        onMoveStart={onMoveStart}
        onMove={placeCallouts}
        minZoom={0.4}
        maxZoom={1.6}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        elevateEdgesOnSelect={false}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        zoomOnDoubleClick={false}
        attributionPosition="bottom-left"
        ariaLabelConfig={ARIA}
        aria-label="Unit 의존 흐름 캔버스"
        style={{ position: "absolute", inset: 0 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.3} color="#b6c0cd" />
        <Panel position="bottom-right" className="f-dock" data-co="6">
          <Controls showInteractive={false} showFitView={false} orientation="horizontal">
            <FitButton boxRef={boxRef} movedRef={movedRef} layout={layout} />
          </Controls>
          <MiniMap
            pannable
            zoomable
            nodeColor={minimapColor}
            nodeStrokeWidth={0}
            nodeBorderRadius={6}
            maskColor="rgb(20 33 61 / 0.07)"
            maskStrokeColor="#46536b"
            maskStrokeWidth={1}
            style={narrow ? MINIMAP_SMALL : MINIMAP_SIZE}
          />
        </Panel>
        <FitKeeper boxRef={boxRef} movedRef={movedRef} layout={layout} selectedId={selectedId} narrow={narrow} />
      </ReactFlow>
    </div>
  );
}

function readParams() {
  const q = {};
  new URLSearchParams(window.location.search).forEach((v, k) => {
    q[k] = v;
  });
  q.state = document.body.getAttribute("data-state") || q.state || "default";
  return q;
}

function App({ q }) {
  const mode = ["empty", "loading", "error"].includes(q.state) ? q.state : "default";
  const readonly = q.state === "readonly";
  /* ?state=proposal: 저장된 변경 제안(units.proposed.json)을 파란 점선으로 겹쳐 보이고 편집 도구줄을 연다 */
  const proposal = q.state === "proposal" ? PROPOSAL : null;
  const units = mode === "default" ? UNITS : [];
  const byId = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const layout = useMemo(() => computeLayout(UNITS, proposal ? 44 : 0), [proposal]);
  const touched = useMemo(() => touchedByProposal(proposal), [proposal]);
  const narrow = useMedia(NARROW);

  const [area, setArea] = useState(AREAS.includes(q.area) ? q.area : "all");
  const [st, setSt] = useState(STATE_FILTERS.some((s) => s.id === q.st) ? q.st : "all");
  const [selectedId, setSelectedId] = useState(byId.has(q.sel) ? q.sel : null);
  const focusTitle = useRef(false);
  const closeRef = useRef(null);

  const isMatch = useCallback(
    (id) => {
      const u = byId.get(id);
      if (!u) return true;
      return (area === "all" || u.area === area) && matchesState(u, st);
    },
    [byId, area, st]
  );
  const view = useMemo(() => ({ isMatch, selectedId, touched }), [isMatch, selectedId, touched]);
  const matched = countBy(units, (u) => isMatch(u.id));

  const onSelect = useCallback((id, from) => {
    focusTitle.current = from === "panel" && Boolean(id);
    setSelectedId(id);
  }, []);
  const onPick = useCallback((id) => onSelect(id, "panel"), [onSelect]);
  const onClose = useCallback(() => {
    const id = selectedId;
    setSelectedId(null);
    requestAnimationFrame(() => {
      const el = id && document.querySelector('.react-flow__node[data-id="' + id + '"]');
      if (el) el.focus({ preventScroll: true });
    });
  }, [selectedId]);

  useEffect(() => {
    if (!focusTitle.current) return;
    focusTitle.current = false;
    const h = document.getElementById("dp-title");
    if (h) h.focus();
  }, [selectedId]);

  useEffect(() => {
    placeCallouts();
  }, [selectedId, area, st]);


  const selected = selectedId ? byId.get(selectedId) : null;
  const onRetry = () => window.HX && window.HX.toast("다시 읽었다 · 14번째 줄 오류가 그대로다");

  let canvas;
  if (mode === "loading") canvas = <LoadingCanvas />;
  else if (mode === "empty") canvas = <EmptyCanvas />;
  else if (mode === "error") canvas = <ErrorCanvas onRetry={onRetry} />;
  else
    canvas = (
      <FlowCanvas units={units} layout={layout} selectedId={selectedId} onSelect={onSelect} view={view} narrow={narrow} proposal={proposal} />
    );

  return (
    <ViewCtx.Provider value={view}>
      <Toolbar
        units={units}
        area={area}
        st={st}
        onArea={setArea}
        onSt={setSt}
        matched={matched}
        disabled={mode !== "default"}
        showCounts={mode === "default" || mode === "empty"}
        mode={proposal ? "proposal" : mode}
      />
      {proposal ? <EditBar readonly={readonly} /> : null}
      <div className={"f-grid" + (narrow ? " narrow" : "") + (selected ? " has-sel" : "")}>
        <section className="f-canvas" aria-label={INTENT.key + " " + INTENT.title + " Unit 흐름"}>
          {proposal ? <ProposalBanner /> : null}
          {canvas}
          <Legend proposal={Boolean(proposal)} />
        </section>
        <aside
          className={"detail" + (selected ? " has-sel" : " is-idle")}
          data-co="8"
          aria-labelledby="dp-title"
          aria-busy={mode === "loading" ? "true" : undefined}
        >
          {mode === "loading" ? (
            <div className="dp-body dp-sk">
              <span className="sk" style={{ width: "40%" }} />
              <span className="sk" style={{ width: "70%", height: 18 }} />
              <span className="sk" style={{ width: "85%" }} />
              <span className="sk" style={{ width: "60%" }} />
              <span className="sk" style={{ width: "78%" }} />
              <h2 id="dp-title" className="sr-only">
                읽는 중
              </h2>
            </div>
          ) : selected ? (
            <UnitDetail unit={selected} units={units} readonly={readonly} onClose={onClose} closeRef={closeRef} />
          ) : (
            <IntentOverview units={units} onPick={onPick} mode={mode} isMatch={isMatch} proposal={proposal} readonly={readonly} />
          )}
        </aside>
      </div>
    </ViewCtx.Provider>
  );
}

let mounted = false;
function mount() {
  const el = document.getElementById("flow-root");
  if (mounted || !el) return;
  mounted = true;
  const root = createRoot(el);
  const q = readParams();
  flushSync(() => root.render(<App q={q} />));
}

document.addEventListener("hx:ready", mount);
document.addEventListener("DOMContentLoaded", () => setTimeout(mount, 0));

/* 캔버스 노드: Intent 영역 · Unit · 게이트 레일. 노드 안에는 누를 것을 두지 않는다(행동은 오른쪽 판). */
import { memo, useContext, createContext } from "react";
import { Handle, Position } from "@xyflow/react";
import { STEPS, STEP_STATE_KO, HARNESS, stepState, currentStepIndex, countBy } from "./data.js";

export const ViewCtx = createContext({ isMatch: () => true, selectedId: null, touched: new Set() });

const HANDLE_STYLE = { opacity: 0, pointerEvents: "none" };

export function Mark({ step, state, size }) {
  const cls = ["m", step.gate ? "gate" : "work", step.stage, state, size || ""].join(" ").trim();
  return <i className={cls} aria-hidden="true" />;
}

/** 여덟 단계 레일. 지금 자리 이름만 표지 아래에 쓴다(나머지는 범례 · 오른쪽 판). */
export function GateRail({ unit, co }) {
  const cur = currentStepIndex(unit);
  const desc = STEPS.map((st) => st.label + " " + STEP_STATE_KO[stepState(unit, st.id)]).join(", ");
  return (
    <div className="g-rail" data-co={co} role="img" aria-label={"게이트: " + desc}>
      <ol>
        {STEPS.map((st, i) => {
          const state = stepState(unit, st.id);
          const prevOk = i > 0 && stepState(unit, STEPS[i - 1].id) === "ok";
          const edge = i === 0 ? "first" : i === STEPS.length - 1 ? "last" : "";
          return (
            <li
              key={st.id}
              className={["g", st.stage, prevOk ? "lit" : "", i === cur ? "cur" : "", edge].join(" ").trim()}
              title={st.label + " · " + STEP_STATE_KO[state]}
            >
              <Mark step={st} state={state} />
              {i === cur ? <span className={"g-lbl " + state}>{st.label}</span> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Harness({ session }) {
  if (!session) return <p className="u-sess muted">세션 없음</p>;
  const h = HARNESS[session.h];
  return (
    <p className="u-sess">
      <span className="harness">
        <b className={session.h} title={h[1]}>
          {h[0]}
        </b>
        <span className="mono">{session.name}</span>
      </span>
      <span className="muted">· {h[1]}</span>
    </p>
  );
}

function Bolts({ done, total }) {
  const cells = [];
  for (let i = 0; i < total; i += 1) {
    cells.push(<i key={i} className={i < done ? "done" : i === done ? "now" : ""} />);
  }
  return (
    <span className="u-bolt">
      <span className="bolts" aria-hidden="true">
        {cells}
      </span>
      Bolt {done}/{total}
    </span>
  );
}

function Status({ unit, proposed }) {
  const s = unit.status;
  return (
    <div className="u-stat">
      <span className={"u-st " + s.tone}>
        {s.tone === "gate" ? <span className="dia" aria-hidden="true" /> : null}
        {s.text}
        {s.sub ? <span className="u-sub"> · {s.sub}</span> : null}
      </span>
      {unit.bolts ? <Bolts done={unit.bolts[0]} total={unit.bolts[1]} /> : null}
      {unit.blocking ? <span className="tag solid-gate">{unit.blocking}</span> : null}
      {unit.question ? <span className="tag gate">{unit.question}</span> : null}
      {proposed ? <span className="tag design u-prop">변경 제안</span> : null}
    </div>
  );
}

function UnitNodeView({ data, selected }) {
  const u = data.unit;
  const view = useContext(ViewCtx);
  const dim = !view.isMatch(u.id);
  const contract = u.kind === "contract";
  const proposed = Boolean(view.touched && view.touched.has(u.id));
  const cls = ["u-node", contract ? "contract" : "", dim ? "is-dim" : "", selected ? "is-sel" : "", proposed ? "is-prop" : ""].join(" ").trim();
  return (
    <div className={cls}>
      <Handle type="target" position={Position.Left} id="l" isConnectable={false} style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Top} id="t" isConnectable={false} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} id="r" isConnectable={false} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Bottom} id="b" isConnectable={false} style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Bottom} id="bt" isConnectable={false} style={HANDLE_STYLE} />
      <div className="u-top">
        {contract ? <span className="chip-contract">계약</span> : null}
        <span className="key">{u.issue}</span>
        <span className="u-id">{u.id}</span>
        <span className="u-area">{u.area}</span>
      </div>
      <p className="u-title">{u.title}</p>
      {contract ? (
        <p className="u-sess u-prov mono" title={u.provides.join(", ")}>
          {u.provides[0]} 외 {u.provides.length - 1}
        </p>
      ) : (
        <Harness session={u.session} />
      )}
      <GateRail unit={u} co={u.id === "U-1" ? "5" : undefined} />
      <Status unit={u} proposed={proposed} />
    </div>
  );
}

export const UnitNode = memo(UnitNodeView);

function IntentNodeView({ data }) {
  const { intent, units } = data;
  const wait = countBy(units, (u) => u.flags.wait);
  const blocked = countBy(units, (u) => u.flags.blocked);
  const contracts = countBy(units, (u) => u.kind === "contract");
  return (
    <div className="i-node">
      <div className="i-head" data-co="2">
        <span className="key">{intent.key}</span>
        <h2>{intent.title}</h2>
        <span className="i-meta">
          Unit {units.length} · 계약 {contracts} · intent 승인 {intent.approved}
        </span>
        <span className="i-cnt">
          <span className="i-c gate">
            <span className="dia" aria-hidden="true" />
            승인 대기 {wait}
          </span>
          <span className="i-c gate">막힘 {blocked}</span>
          <span className="i-c">질문 {intent.questionsOpen}</span>
        </span>
      </div>
    </div>
  );
}

export const IntentNode = memo(IntentNodeView);

export const NODE_TYPES = { unit: UnitNode, intent: IntentNode };

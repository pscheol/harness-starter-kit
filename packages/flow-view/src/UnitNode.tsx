import { Handle, Position, type NodeProps } from "@xyflow/react";
import { flagText, stepOf, type FlowLabels, type UnitData } from "./types";

type Data = UnitData & { labels: FlowLabels; unitId: string; contract: boolean; [k: string]: unknown };

/** 단계 → 색 계열(설계 · 구현 · 반영 · 배포). 색은 뜻이고 글자가 늘 같이 있다. */
const FAMILY: Record<string, string> = { requirements: "design", design: "design", tasks: "design", impl: "build", verify: "build", mr: "ops", done: "ops", deploy: "ops" };

function Gate({ state, family, label }: { state: "done" | "active" | "todo"; family: string; label: string }) {
  return (
    <svg className={`hk-gate ${family} ${state}`} width="14" height="14" viewBox="0 0 14 14" role="img" aria-label={label}>
      <title>{label}</title>
      <path d="M7 1 13 7 7 13 1 7Z" />
    </svg>
  );
}

export function UnitNode({ data, selected }: NodeProps) {
  const d = data as Data;
  const labels = d.labels;
  const steps = (d.steps ?? []).map(stepOf);
  const active = steps.find((s) => s.state === "active");
  const last = [...steps].reverse().find((s) => s.state === "done");
  const shown = active ?? last;
  const bolts = d.bolts;
  return (
    <div className={`hk-node${d.contract ? " contract" : ""}${selected ? " selected" : ""}`}>
      <Handle type="target" position={d.contract ? Position.Top : Position.Left} isConnectable={false} />
      <div className="hk-node-head">
        {d.contract ? <span className="hk-pill contract">{labels.contractTag}</span> : null}
        <span className="hk-key">{d.issue ?? d.unitId}</span>
        <span className="hk-uid">{d.unitId}</span>
        {d.area ? <span className="hk-pill area">{d.area}</span> : null}
      </div>
      <div className="hk-title">{d.title ?? ""}</div>
      {d.contract ? (
        <div className="hk-sub">{(d.contracts ?? []).join(" · ")}</div>
      ) : (
        <div className="hk-sub">{d.session ? `${d.session.name ?? labels.noSession} · ${d.session.harness ?? ""}` : labels.noSession}</div>
      )}
      <div className="hk-rail">
        {steps.map((s) => {
          const name = labels.steps[s.id] ?? s.id;
          return <Gate key={s.id} state={s.state} family={FAMILY[s.id] ?? "design"} label={`${name} ${labels.state[s.state]}`} />;
        })}
      </div>
      <div className="hk-state">
        {shown ? <span className={`hk-pill ${FAMILY[shown.id] ?? "design"}`}>{`${labels.steps[shown.id] ?? shown.id} ${active ? labels.state.active : labels.state.done}`}</span> : null}
        {bolts && !d.contract ? (
          <span className="hk-bolts">
            {labels.bolt} {bolts.done}/{bolts.total}
            {bolts.estimated ? ` ${labels.estimated}` : ""}
          </span>
        ) : null}
      </div>
      {(d.flags ?? []).length ? (
        <div className="hk-flags">
          {(d.flags ?? []).map((f) => (
            <span key={f} className="hk-pill gate">
              {flagText(f, labels)}
            </span>
          ))}
        </div>
      ) : null}
      <Handle type="source" position={d.contract ? Position.Bottom : Position.Right} isConnectable={false} />
    </div>
  );
}

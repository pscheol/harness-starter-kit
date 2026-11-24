/* 의존 선. dep = 실선(앞 Unit → 뒤 Unit), contract = 점선(계약 Unit → 그 계약을 쓰는 Unit). */
import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath } from "@xyflow/react";

function Label({ x, y, text, title, contract, hot, dim, kind }) {
  if (!text) return null;
  const cls = ["e-label", contract ? "contract" : "", hot ? "hot" : "", dim ? "dim" : "", kind || ""].join(" ").trim();
  return (
    <EdgeLabelRenderer>
      <span
        className={cls}
        title={title || undefined}
        style={{ transform: "translate(-50%, -50%) translate(" + x + "px, " + y + "px)" }}
      >
        {text}
      </span>
    </EdgeLabelRenderer>
  );
}

export function DepEdge(props) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data } = props;
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} className={"e-dep" + (data.cut ? " e-cut-path" : "")} interactionWidth={0} />
      <Label x={lx} y={ly - 13} text={data.label} title={data.title} hot={data.hot} dim={data.dim} kind={data.cut ? "cut" : ""} />
    </>
  );
}

export function ContractEdge(props) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data } = props;
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 10,
    offset: 24
  });
  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} className="e-contract" interactionWidth={0} />
      <Label
        x={targetX}
        y={targetY - 30}
        text={data.label}
        title={data.title}
        contract
        hot={data.hot}
        dim={data.dim}
      />
    </>
  );
}

/** 변경 제안으로 더할 의존: 아래로 돌아 가는 파란 점선(가운데 Unit을 덮지 않는다) */
export function ProposedEdge(props) {
  const { sourceX, sourceY, targetX, targetY, markerEnd, data } = props;
  const [path, lx, ly] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition: "bottom",
    targetPosition: "bottom",
    borderRadius: 12,
    offset: 30
  });
  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} className="e-prop-path" interactionWidth={0} />
      <Label x={lx} y={ly + 2} text={data.label} title={data.title} kind="proposed" />
    </>
  );
}

export const EDGE_TYPES = { dep: DepEdge, contract: ContractEdge, proposed: ProposedEdge };

/**
 * 흐름 보기(S12, 설계 06 §3.16). `GET /flow` 의 nodes · edges 를 그대로 그린다. 자리는 서버가 정한다(드래그 · 연결 없음).
 * 접근성: 노드는 Tab 으로 가고 Enter · Space 로 고르고 Esc 로 푼다(React Flow 기본 동작). 색만으로 말하지 않고 단계 · 상태를 글자로 같이 쓴다.
 * 이 파일은 화면에 글을 HTML 로 넣지 않는다(React 가 textContent 로만 넣는다).
 */
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node, type NodeChange, type NodeTypes } from "@xyflow/react";
import { useCallback, useMemo } from "react";
import { UnitNode } from "./UnitNode";
import { ariaLabelOf, type FlowData, type FlowLabels, type UnitData } from "./types";

const X_STEP = 280;
const Y_STEP = 160;

const nodeTypes: NodeTypes = { unit: UnitNode, "contract-unit": UnitNode };

export interface FlowViewProps {
  data: FlowData;
  selectedId: string | null;
  labels: FlowLabels;
  onSelect: (id: string | null) => void;
}

export function FlowView({ data, selectedId, labels, onSelect }: FlowViewProps) {
  const nodes = useMemo<Node<UnitData & Record<string, unknown>>[]>(
    () =>
      data.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: { x: n.position.x * X_STEP, y: n.position.y * Y_STEP },
        data: { ...n.data, labels, unitId: n.id, contract: n.type === "contract-unit" } as UnitData & Record<string, unknown>,
        selected: n.id === selectedId,
        draggable: false,
        connectable: false,
        ariaLabel: ariaLabelOf(n.id, n.type, n.data as UnitData, labels),
      })),
    [data, selectedId, labels],
  );
  const edges = useMemo<Edge[]>(
    () =>
      data.edges.map((e, i) => ({
        id: `${e.source}->${e.target}:${i}`,
        source: e.source,
        target: e.target,
        type: "smoothstep",
        className: e.kind === "contract" ? "hk-edge hk-edge-contract" : "hk-edge",
        ...(e.label ? { label: e.label } : e.kind === "contract" ? { label: labels.contract } : {}),
        focusable: false,
      })),
    [data, labels],
  );
  // 자리는 서버가 정하므로 선택만 받는다(Enter · Space 로 고르고 Esc 로 푼다, React Flow 기본 키보드 동작)
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const c of changes) {
        if (c.type !== "select") continue;
        if (c.selected) onSelect(c.id);
        else if (c.id === selectedId) onSelect(null);
      }
    },
    [selectedId, onSelect],
  );
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      nodesFocusable
      edgesFocusable={false}
      fitView
      fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
      minZoom={0.2}
      maxZoom={1.6}
      proOptions={{ hideAttribution: true }}
      onNodesChange={onNodesChange}
      onPaneClick={() => onSelect(null)}
      aria-label={labels.canvas}
    >
      <Background gap={24} />
      <Controls showInteractive={false} aria-label={labels.controls} />
      <MiniMap pannable zoomable ariaLabel={labels.minimap} style={{ width: 150, height: 96 }} nodeColor={() => "#aeb9c7"} nodeStrokeColor={() => "#46536b"} nodeStrokeWidth={2} maskColor="rgb(20 33 61 / 0.08)" />
    </ReactFlow>
  );
}

/**
 * 보드 여덟 상태(설계 10 §3.4 · README §9, MD-R15). 킷 단계(문서 머리 · 승인 기록)에서만 계산한다.
 * Jira 가 없어도 같은 여덟 이름으로 돈다. jira-workflow 의 `sync jira` 도 이 함수로 "킷이 가야 할 상태"를 정한다.
 * 배포됨(deployed)은 배포 승인 기록에서 오므로 호출하는 쪽이 `deployed` 로 넘긴다(없으면 완료에서 멈춘다).
 */
export const BOARD_STATES = [
  { id: "backlog", label: "백로그" },
  { id: "requirements-draft", label: "요구사항 작성" },
  { id: "requirements-review", label: "요구사항 승인 대기" },
  { id: "design", label: "설계" },
  { id: "implementing", label: "구현 중" },
  { id: "verifying", label: "검증" },
  { id: "done", label: "완료" },
  { id: "deployed", label: "배포됨" },
] as const;

export type BoardStateId = (typeof BOARD_STATES)[number]["id"];

export interface BoardStatus {
  id: BoardStateId;
  label: string;
}

/** 문서 하나의 판정에 필요한 값(DocInfo 의 일부). */
export interface BoardDoc {
  status: string | null;
  state?: string | null;
  approval?: string;
}

export interface BoardInput {
  requirements: BoardDoc | null;
  design: BoardDoc | null;
  tasks: BoardDoc | null;
  /** 배포 승인 기록이 유효하다(14 §3.4). 기본 false */
  deployed?: boolean;
}

function status(id: BoardStateId): BoardStatus {
  return { id, label: (BOARD_STATES.find((s) => s.id === id) as { label: string }).label };
}

function approved(d: BoardDoc | null): boolean {
  return !!d && (d.approval === "valid" || d.status === "approved");
}

export function boardStatusOf(input: BoardInput): BoardStatus {
  const { requirements, design, tasks } = input;
  if (input.deployed) return status("deployed");
  if (tasks?.state === "completed") return status("done");
  if (tasks?.state === "check") return status("verifying");
  if (approved(tasks) || tasks?.state === "active") return status("implementing");
  if (approved(requirements) || design) return status("design");
  if (requirements?.status === "in-review") return status("requirements-review");
  if (requirements) return status("requirements-draft");
  return status("backlog");
}

/** 에이전트가 올릴 수 있는 상태의 상한은 검증이다(agentBoundary.maxStatus: verifying). */
export function stateIndex(id: string): number {
  return BOARD_STATES.findIndex((s) => s.id === id);
}

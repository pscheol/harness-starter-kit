/** 관리 페이지가 쓰는 CLI 함수(doctor · outdated). 서버 모듈은 CLI 를 import 하지 않고 이것을 받는다. */
import type { Deps, DoctorSummary } from "../../../dashboard/src/project";
import type { Ctx, Io } from "../cli/context";
import { type Finding, runDoctor } from "./doctor";
import { runOutdated } from "./outdated";

function quietIo(env: Record<string, string | undefined>, cwd: string): Io {
  return { stdout: () => undefined, stderr: () => undefined, env, cwd, cliFile: __filename, isTTY: false, nodeVersion: process.versions.node };
}

function ctxFor(root: string, env: Record<string, string | undefined>, command: string): Ctx {
  return { io: quietIo(env, root), command, values: { cwd: root }, positionals: [], json: true, quiet: true };
}

/** 정보(info)라도 사람이 손봐야 하는 종류. drifted(사람이 고친 킷 파일)는 정상이라 여기 없다 — 참고(notes)로만 보인다. */
const PROBLEM_KINDS = new Set(["stale", "symlink-found", "missing", "role-mismatch"]);
const LIMIT = 20;

/**
 * 관리 페이지에 보이는 doctor 항목 이름 · 한 줄 풀이(합니다체). CLI 출력(해라체 hint)과 따로 둔다.
 * 처음 보는 사람이 "문제인지 정상인지 · 무엇을 하면 되는지"를 알게 쓴다. 없는 종류는 종류 이름 그대로 보인다.
 */
const DOCTOR_KO: Record<string, { label: string; help: string }> = {
  drifted: { label: "내가 고친 킷 파일", help: "정상입니다. 팀이 고친 파일은 킷을 올려도 덮어쓰지 않고, 새 판을 옆에 <파일>.new 로 따로 받습니다." },
  missing: { label: "빠진 킷 파일", help: "킷이 깔아 둔 파일이 없습니다. 터미널에서 knots-sync repair 로 되살립니다." },
  stale: { label: "옛 판 그대로인 파일", help: "새 판 내용으로 바꿔야 하는 파일입니다. knots-sync repair 로 맞춥니다." },
  "symlink-found": { label: "링크로 된 파일", help: "킷 파일은 실제 복사본이어야 합니다. knots-sync repair 로 복사본으로 바꿉니다." },
  "role-mismatch": { label: "역할 설정 어긋남", help: "역할별 하네스 설정이 실제 설치와 다릅니다. knots-sync doctor 에서 자세히 봅니다." },
  "merge-missing": { label: "합쳐 넣을 구간 없음", help: "킷이 내용을 합쳐 넣는 표시 구간이 사라졌습니다. knots-sync repair 로 되살립니다." },
  "pending-new": { label: "아직 안 본 새 판(.new)", help: "킷을 올릴 때 받은 .new 파일이 남아 있습니다. 원래 파일과 비교해 합친 뒤 .new 를 지웁니다." },
  "version-mismatch": { label: "킷 판 번호 어긋남", help: "설치 정보와 잠금 파일의 킷 판이 다릅니다. knots-sync update 로 맞춥니다." },
  "meta-invalid": { label: "설치 정보 파일 오류", help: ".agents/knots-sync.json 을 읽지 못했습니다. 최근 고친 내용을 확인합니다." },
  "lock-invalid": { label: "잠금 파일 오류", help: ".agents/knots-sync.lock 을 읽지 못했거나 리포 밖을 가리킵니다." },
  "lock-v1": { label: "옛 형식 잠금 파일", help: "다음 knots-sync update 가 새 형식으로 바꿉니다. 지금 할 일은 없습니다." },
  "legacy-names": { label: "옛 이름 상태 파일", help: "옛 이름(harness-kit) 파일입니다. 다음 knots-sync update 가 새 이름으로 옮깁니다." },
  "upgrade-notice-expired": { label: "지난 업그레이드 공지", help: "기한이 지난 공지입니다. 다음 update 가 지웁니다(지금 지워도 됩니다)." },
  gitignore: { label: ".gitignore 빠진 줄", help: "커밋하지 않아야 할 폴더가 .gitignore 에 없습니다. 안내된 줄을 넣습니다." },
  gitattributes: { label: ".gitattributes 빠진 줄", help: "줄바꿈 · 병합 설정 줄이 없습니다. 안내된 줄을 넣습니다." },
  "entry-size": { label: "세션에 실리는 파일이 큼", help: "세션마다 읽히는 규칙 파일이 상한보다 큽니다. 내용을 줄이거나 나눕니다." },
  "steering-size": { label: "규칙 파일이 큼", help: "하네스가 늘 읽는 규칙 파일이 상한보다 큽니다." },
  "gate-floor": { label: "빼면 안 되는 단계가 빠짐", help: "요구사항 · 설계 같은 하한 단계는 흐름에서 뺄 수 없습니다. flow.gates 를 되돌립니다." },
  "floor-hook-missing": { label: "필수 훅 없음", help: "보호 · 검증 훅이 빠졌습니다. knots-sync repair 로 되살립니다." },
  "floor-override": { label: "필수 훅을 덮어씀", help: "팀 설정이 필수 훅을 덮어씁니다. 그 항목을 지웁니다." },
  "hooks-missing": { label: "훅 설정 없음", help: ".agents/hooks.json 이 없습니다. knots-sync repair 로 되살립니다." },
  "hook-script-missing": { label: "훅 스크립트 없음", help: "훅이 부르는 스크립트 파일이 없습니다. knots-sync repair 로 되살립니다." },
  "full-allowed": { label: "전체 검증을 사람에게 엶", help: "verify.fullOnlyInCI 가 꺼져 있습니다. 팀이 정한 것이면 그대로 둡니다." },
  "local-invalid": { label: "개인 설정 오류", help: "내 컴퓨터의 개인 설정 파일을 읽지 못했습니다." },
  "personal-ignored": { label: "개인 설정에서 무시한 값", help: "개인 설정이 바꿀 수 없는 값을 적어 무시했습니다." },
  "personal-weakens": { label: "개인 설정이 보호를 끔", help: "개인 설정이 킷 보호 · 검증 훅까지 끕니다." },
  approvers: { label: "승인자 설정 문제", help: "승인자 목록에 확인이 필요한 항목이 있습니다." },
  "deploy-config": { label: "배포 설정 오류", help: ".agents/deploy.json 을 확인합니다." },
  "deploy-guard-missing": { label: "배포 승인 확인 단계 없음", help: "운영 배포 첫 단계에 승인 확인(deploy.py check)이 없습니다." },
  "relative-ref": { label: "상대 경로 참조", help: "규칙 파일 안의 상대 경로가 하네스 위치에서 깨집니다." },
  "skill-model-field": { label: "스킬 모델 칸", help: "스킬 파일의 model 칸을 확인합니다." },
  "role-model-locked": { label: "역할 모델 고정", help: "역할에 고정된 모델을 확인합니다." },
  "layout-conflict": { label: "폴더 배치 충돌", help: "같은 파일을 두 곳에서 관리합니다." },
  "vscode-settings": { label: "VS Code 설정", help: "VS Code 설정 파일을 확인합니다." },
  "external-hooks-left": { label: "끈 모듈의 훅이 남음", help: "꺼 둔 선택 모듈이 하네스 설정에 훅을 남겼습니다. 그 도구의 명령으로 뺍니다(킷은 건드리지 않습니다)." },
  "concurrent-sessions": { label: "같은 폴더에서 세션 여럿", help: "한 작업 공간에서 AI 세션이 동시에 돕니다. 이슈마다 작업 공간을 나눕니다." },
  "global-hooks-path": { label: "전역 git 훅 경로", help: "이 컴퓨터의 git 이 전역 훅 폴더를 씁니다. 리포 훅이 돌지 않을 수 있습니다." },
  "push-policy": { label: "push 규칙", help: "push 규칙 설정을 확인합니다." },
  "module-conflict": { label: "모듈끼리 충돌", help: "켠 선택 모듈 둘이 같은 파일을 다룹니다." },
  "module-decl": { label: "모듈 선언 오류", help: "선택 모듈 선언을 읽지 못했습니다." },
  "module-undeclared": { label: "선언 없는 모듈", help: "설치 정보에 없는 모듈 파일이 있습니다." },
};

type Item = DoctorSummary["problems"][number];
const item = (f: Finding): Item => ({ kind: f.kind, severity: f.severity, ...(f.path ? { path: f.path } : {}), message: f.hint ?? f.kind, label: DOCTOR_KO[f.kind]?.label ?? f.kind, help: DOCTOR_KO[f.kind]?.help ?? f.hint ?? "" });
const countOf = (xs: Finding[]): Record<string, number> => xs.reduce<Record<string, number>>((a, f) => ({ ...a, [f.kind]: (a[f.kind] ?? 0) + 1 }), {});

export function doctorSummary(root: string, env: Record<string, string | undefined>): DoctorSummary {
  const r = runDoctor(ctxFor(root, env, "doctor"));
  const findings = (r.data.findings as Finding[]) ?? [];
  const isProblem = (f: Finding): boolean => f.severity === "error" || f.severity === "warn" || PROBLEM_KINDS.has(f.kind);
  const problems = findings.filter(isProblem);
  const notes = findings.filter((f) => !isProblem(f));
  return {
    status: problems.length ? "problems" : "ok",
    counts: countOf(problems),
    problems: problems.slice(0, LIMIT).map(item),
    noteCounts: countOf(notes),
    notes: notes.slice(0, LIMIT).map(item),
  };
}

export function dashboardDeps(): Deps {
  return {
    doctor: (root, env) => doctorSummary(root, env),
    outdated: (root, env) => {
      const r = runOutdated(ctxFor(root, env, "outdated"));
      const { target: _t, ...rest } = r.data as Record<string, unknown>;
      return rest;
    },
  };
}

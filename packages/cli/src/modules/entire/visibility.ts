/**
 * 원격 저장소 공개 여부와 체크포인트 push 정책(설계 10 §3.3 4단계, D6 · MD-R13).
 * 확인 방법: `gh repo view --json visibility` · `glab repo view -F json`. 확인하지 못하면 공개로 보고 올리지 않는다.
 * 네트워크 호출은 gh · glab 이 한다(킷은 그 명령만 부른다). 모델을 부르지 않는다.
 */
import type { Io } from "../../cli/context";
import { git } from "../../core/git";
import { runCmd } from "../tools";

export type Visibility = "public" | "private" | "internal" | "unknown";

export interface VisibilityResult {
  host: "github" | "gitlab" | "other" | "none";
  remote: string | null;
  visibility: Visibility;
  /** 확인한 방법 또는 확인하지 못한 이유 */
  via: string;
}

export function remoteUrl(io: Io, root: string): string | null {
  const r = git(["-C", root, "remote", "get-url", "origin"], io.env);
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}

export function hostOf(url: string): VisibilityResult["host"] {
  const m = /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)/i.exec(url.trim());
  const host = (m?.[1] ?? "").toLowerCase();
  if (host === "github.com") return "github";
  if (host === "gitlab.com" || host.startsWith("gitlab.")) return "gitlab";
  return "other";
}

function parseVisibility(text: string): Visibility {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const v = typeof j.visibility === "string" ? j.visibility.toLowerCase() : "";
    return v === "public" || v === "private" || v === "internal" ? v : "unknown";
  } catch {
    return "unknown";
  }
}

export function checkVisibility(io: Io, root: string): VisibilityResult {
  const remote = remoteUrl(io, root);
  if (!remote) return { host: "none", remote: null, visibility: "unknown", via: "origin 원격이 없다" };
  const host = hostOf(remote);
  if (host === "other") return { host, remote, visibility: "unknown", via: "GitHub · GitLab.com 이 아니다(자체 호스팅은 확인하지 않는다)" };
  const argv = host === "github" ? ["gh", "repo", "view", "--json", "visibility"] : ["glab", "repo", "view", "-F", "json"];
  const r = runCmd(io, root, argv, { timeout: 20_000 });
  if (r.missing) return { host, remote, visibility: "unknown", via: `${argv[0]} 가 없다` };
  if (r.status !== 0) return { host, remote, visibility: "unknown", via: `${argv[0]} 실패(인증 · 접근 확인)` };
  const visibility = parseVisibility(r.stdout);
  return { host, remote, visibility, via: visibility === "unknown" ? `${argv[0]} 출력에 visibility 가 없다` : `${argv.slice(0, 3).join(" ")}` };
}

/** private · internal 만 같은 원격에 올린다. 나머지(public · 확인 실패)는 올리지 않는다. */
export const uploadsAllowed = (v: Visibility): boolean => v === "private" || v === "internal";

export interface PushState {
  /** .entire/settings(.local).json 의 strategy_options.push_sessions. 없으면 기본(올림) */
  pushSessions: boolean;
  /** .git/entire/checkpoint-push-policy 의 값(없으면 null) */
  policy: string | null;
}

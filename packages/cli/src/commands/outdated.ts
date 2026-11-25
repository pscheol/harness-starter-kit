/**
 * outdated — 설치 판 · CLI 판 · 소스의 최신 태그를 비교한다(HK-12 design §5, 설계 02 §3.3). 읽기만 한다.
 * 소스에 닿지 못하면(네트워크 없음 · git 없음) 최신 칸을 "확인 못 함"으로 두고 exit 0. 소스를 모르면 기본 원격(DEFAULT_SOURCE)을 본다.
 */
import { bool, str } from "../cli/args";
import { targetOf, type CommandResult, type Ctx } from "../cli/context";
import { CliError, EXIT, usageError } from "../core/errors";
import { gitRepoPath, maxVersion, remoteVersions } from "../core/git";
import { readLock } from "../core/lock";
import { META_REL, readMeta } from "../core/meta";
import { compareSemver, VERSION } from "../core/version";
import { pinnedCli } from "../core/kit-cli";
import { lockFile, metaFile } from "../core/legacy-names";

type Source = { url: string; from: "flag" | "env" | "lock" | "default" } | { url: null; reason: string };

/** 소스를 아무 데서도 못 정했을 때 보는 킷 원격(사용자 결정 2026-11-24). KNOTS_SYNC_SOURCE=none 이면 쓰지 않는다. */
export const DEFAULT_SOURCE = "https://github.com/pscheol/harness-starter-kit.git";

/** lock kit.source → git 원격. github:<owner>/<repo>[#…] · git+<url> · file:<폴더>(git 저장소일 때). */
function fromKitSource(raw: string | null, env: Record<string, string | undefined>): string | null {
  if (!raw) return null;
  const gh = /^github:([\w.-]+\/[\w.-]+?)(?:\.git)?(?:#.*)?$/.exec(raw);
  if (gh) return `https://github.com/${gh[1]}.git`;
  if (raw.startsWith("git+")) return raw.slice(4).replace(/#.*$/, "");
  if (raw.startsWith("file:")) return gitRepoPath(raw.slice(5), env);
  return null;
}

function sourceOf(ctx: Ctx, target: string): Source {
  const lock = readLock(lockFile(target));
  return pickSource(str(ctx.values, "source"), ctx.io.env, lock.status === "ok" ? lock.lock.kit.source : null);
}

/** --source > KNOTS_SYNC_SOURCE > lock kit.source > 기본 원격. KNOTS_SYNC_SOURCE=none 이면 기본 원격도 쓰지 않는다. */
export function pickSource(flag: string | undefined, envVars: Record<string, string | undefined>, lockSource: string | null): Source {
  const env = envVars.KNOTS_SYNC_SOURCE || undefined;
  if (env === "none" && flag === undefined) return { url: null, reason: "KNOTS_SYNC_SOURCE=none — 소스를 보지 않는다" };
  const given = flag !== undefined ? { url: flag, from: "flag" as const } : env !== undefined ? { url: env, from: "env" as const } : null;
  if (given) {
    if (given.url.startsWith("-")) throw usageError(`--source 는 '-' 로 시작할 수 없다: '${given.url}'`, "git 원격 주소나 저장소 경로를 준다");
    return given;
  }
  const url = fromKitSource(lockSource, envVars);
  if (url && !url.startsWith("-")) return { url, from: "lock" };
  return { url: DEFAULT_SOURCE, from: "default" };
}

const isPre = (v: string): boolean => /^\d+\.\d+\.\d+-/.test(v);
const newer = (a: string, b: string): boolean => (compareSemver(a, b) ?? 0) > 0;

export function runOutdated(ctx: Ctx): CommandResult {
  const target = targetOf(ctx);
  const m = readMeta(metaFile(target));
  if (m.status === "missing") throw new CliError(EXIT.STATE, `설치되지 않은 리포다(${META_REL} 없음): ${target}`, "설치는 knots-sync init");
  if (m.status === "invalid") throw new CliError(EXIT.STATE, `메타를 해석하지 못했다: ${m.error}`, "knots-sync doctor 로 상태를 본다");
  const installed = m.meta.kit.version;
  const src = sourceOf(ctx, target);
  // 사전 출시 태그는 설치 판이나 CLI 가 사전 출시일 때만 센다(그 줄을 고른 사람).
  const preTrack = isPre(installed) || isPre(VERSION);
  let latest: Record<string, unknown>;
  let latestVersion: string | null = null;
  if (src.url === null) latest = { status: "unknown", source: null, reason: src.reason };
  else {
    const tags = remoteVersions(src.url, ctx.io.env);
    if (!tags.ok) latest = { status: "unknown", source: src.url, reason: tags.reason };
    else {
      const stable = maxVersion(tags.versions.filter((v) => !isPre(v)));
      latestVersion = preTrack ? maxVersion(tags.versions) : stable;
      latest = { status: "ok", version: latestVersion, stable, source: src.url, from: src.from, tags: tags.versions.length };
    }
  }
  const newest = latestVersion && newer(latestVersion, VERSION) ? latestVersion : VERSION;
  const isNewer = newer(newest, installed);
  const upgrade = !isNewer ? null : newest === VERSION ? "knots-sync update" : pinnedCli(newest, "update", src.url);
  const data: Record<string, unknown> = { command: "outdated", target, installed, cli: VERSION, latest, newest, newer: isNewer, upgrade, packs: m.meta.packs };
  const latestText = latest.status === "ok" ? `${String(latest.version ?? "없음")} (${String(latest.source)})` : `확인 못 함 — ${String(latest.reason)}`;
  const lines = [
    `knots-sync outdated — ${target}`,
    `  설치 ${installed} · CLI ${VERSION} · 최신 태그 ${latestText}`,
    isNewer ? `  → 새 판 ${newest} 이 있다: ${String(upgrade)}` : "  최신이다",
    ...(newer(installed, VERSION) ? [`  ⚠ 설치된 킷(${installed})이 이 CLI 보다 새것이다. 새 CLI 를 쓴다`] : []),
  ];
  const code = bool(ctx.values, "check") && isNewer ? EXIT.CHECK : EXIT.OK;
  return { code, data, lines };
}

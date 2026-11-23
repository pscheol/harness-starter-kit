declare const __HK_VERSION__: string;

/** 빌드(build.mjs) · 시험(vitest.config.ts)이 package.json 의 version 을 넣는다. */
export const VERSION: string = __HK_VERSION__;

/** util.parseArgs 가 18.3 에 들어왔다. engines 와 같은 값이다. */
export const MIN_NODE = { major: 18, minor: 3 } as const;
export const MIN_NODE_TEXT = `${MIN_NODE.major}.${MIN_NODE.minor}`;

/** "16.20.2" · "v18.2.0" → 18.3 미만이면 true. 해석하지 못하면 false(막지 않는다). */
export function nodeTooOld(version: string): boolean {
  const [maj, min] = version.replace(/^v/, "").split(".").map((x) => Number.parseInt(x, 10));
  if (maj === undefined || !Number.isFinite(maj)) return false;
  if (maj !== MIN_NODE.major) return maj < MIN_NODE.major;
  return Number.isFinite(min) && (min as number) < MIN_NODE.minor;
}

interface Semver {
  core: number[];
  pre: string[];
}

function parseSemver(v: string): Semver | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(v.trim());
  if (!m) return null;
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split(".") : [] };
}

function comparePre(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return b.length - a.length; // 사전 출시 태그가 없는 쪽이 크다
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i];
    const y = b[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x) ? Number(x) : null;
    const ny = /^\d+$/.test(y) ? Number(y) : null;
    if (nx !== null && ny !== null && nx !== ny) return nx - ny;
    if (nx !== null && ny === null) return -1;
    if (nx === null && ny !== null) return 1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** semver 비교(사전 출시 태그 포함). 해석하지 못하면 문자열이 같을 때만 0, 아니면 null. */
export function compareSemver(a: string, b: string): number | null {
  const x = parseSemver(a);
  const y = parseSemver(b);
  if (!x || !y) return a === b ? 0 : null;
  for (let i = 0; i < 3; i += 1) {
    const d = (x.core[i] as number) - (y.core[i] as number);
    if (d !== 0) return Math.sign(d);
  }
  return Math.sign(comparePre(x.pre, y.pre));
}

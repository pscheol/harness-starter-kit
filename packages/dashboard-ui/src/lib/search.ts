// 찾기 칸 입력 → 이동할 앱 경로.
/** 입력 글 → 이동할 앱 경로. 이슈 키 · Intent 키 · 문서 경로 · 그 밖은 문서 찾기 */
export function searchTarget(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const key = /^([A-Za-z][A-Za-z0-9]+-\d+)$/.exec(v)?.[1]?.toUpperCase();
  if (key && /^INT-/.test(key)) return `/intents/${key}/questions`;
  if (key) return `/issues/${key}`;
  const m = /issues\/([A-Z][A-Z0-9]+-\d+)-[^/]+\/(requirements|design|tasks)\.md/.exec(v);
  if (m) return `/issues/${m[1]}/docs/${m[2]}`;
  return `/docs?q=${encodeURIComponent(v)}`;
}

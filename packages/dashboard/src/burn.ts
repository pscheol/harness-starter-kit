/**
 * 남은 Bolt 계단선(설계 06 §3.16 · 화면기획서 S12 영역 13). `GET /intents/{key}/burn?days=`.
 * 날짜별 값은 연결된 이슈의 tasks.md git 기록(`git log` 한 번 + 바뀐 판마다 `git show`)에서 구한다.
 * 기록 없는 날은 앞 날 값을 잇는다. 읽기만 한다(git 읽기 명령).
 */
import { bad } from "./errors";
import { type IntentInfo, readUnitsFile } from "./flow";
import type { Project } from "./project";
import { bolts, type IssueModel } from "./readers/issues";
import { git } from "./util";

const DAY = 86_400_000;

interface Point {
  at: number;
  total: number;
  done: number;
}

const localDate = (ms: number): string => {
  const d = new Date(ms);
  const p2 = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};

async function history(p: Project, issue: IssueModel): Promise<Point[]> {
  if (!issue.root) return [];
  const rel = `${issue.dir}/tasks.md`;
  const log = await git(issue.root, p.env, "log", "--format=%H%x09%cI", "--", rel);
  if (log.code !== 0) return [];
  const pts: Point[] = [];
  for (const line of log.stdout.split("\n").filter(Boolean).reverse()) {
    const [sha, iso] = line.split("\t") as [string, string];
    const shown = await git(issue.root, p.env, "show", `${sha}:${rel}`);
    if (shown.code !== 0) continue;
    const b = bolts(shown.stdout);
    pts.push({ at: Date.parse(iso), total: b.total, done: b.done });
  }
  return pts;
}

interface Track {
  estimated: boolean;
  points: Point[];
  now: { total: number; done: number };
}

export async function burnData(p: Project, info: IntentInfo, issues: IssueModel[], daysText: string | null): Promise<Record<string, unknown>> {
  const days = daysText === null ? 14 : Number(daysText);
  if (!Number.isInteger(days) || days < 1 || days > 90) throw bad("days 는 1~90 이다");
  const { units } = readUnitsFile(info.abs);
  // 계약 Unit 은 자기 이슈가 없으면 Bolt 가 없다(S12 노드도 Bolt 를 그리지 않는다)
  const live = units.filter((u) => u.planned && !(u.kind === "contract" && !u.issue));
  const startDay = new Date();
  startDay.setHours(0, 0, 0, 0);
  const first = startDay.getTime() - (days - 1) * DAY;
  const tracks: Track[] = [];
  let unitsDone = 0;
  for (const u of live) {
    const issue = u.issue ? issues.find((i) => i.key === u.issue) : undefined;
    const tasks = issue?.docs.tasks?.bolts;
    if (issue?.stage === "completed") unitsDone += 1;
    if (issue && tasks && tasks.total > 0) tracks.push({ estimated: false, points: await history(p, issue), now: tasks });
    else tracks.push({ estimated: true, points: [], now: { total: Math.max(1, Math.ceil(u.stories.length / 3)), done: 0 } });
  }
  const series: { date: string; remaining: number; total: number; done: number }[] = [];
  for (let i = 0; i < days; i += 1) {
    const end = first + (i + 1) * DAY - 1;
    const today = i === days - 1;
    let total = 0;
    let done = 0;
    for (const t of tracks) {
      if (t.estimated || today) {
        total += t.now.total;
        done += t.now.done;
        continue;
      }
      const last = t.points.filter((x) => x.at <= end).pop();
      if (last) {
        total += last.total;
        done += last.done;
      }
    }
    series.push({ date: localDate(first + i * DAY + DAY / 2), remaining: total - done, total, done });
  }
  const now = series[series.length - 1] ?? { remaining: 0, total: 0, done: 0 };
  return {
    intent: info.key,
    days,
    series,
    now: { remaining: now.remaining, total: now.total, done: now.done, units: { done: unitsDone, total: live.length } },
    estimated: tracks.some((t) => t.estimated),
  };
}

/** Jira Cloud REST v3 클라이언트(설계 10 §3.4 · §3.6). 인증은 이메일 + API 토큰(환경 변수), 토큰은 이 모듈 밖으로 나가지 않는다. */
import { CliError, EXIT } from "../../core/errors";
import { checkBaseUrl, makeRequester, type HttpOptions, type Requester } from "../http";
import type { TrackerConfig } from "./config";

export interface JiraTransition {
  id: string;
  name: string;
  toId: string;
}

export interface JiraChange {
  id: string;
  created: string;
  authorAccountId: string | null;
  from: string;
  to: string;
}

export interface JiraAttachment {
  filename: string;
  size: number;
  url: string;
}

export interface JiraIssue {
  key: string;
  summary: string;
  type: string;
  statusId: string;
  statusName: string;
  description: unknown;
  attachments: JiraAttachment[];
  updated: string;
  webUrl: string;
}

export interface JiraClient {
  issue(key: string): Promise<JiraIssue>;
  children(key: string): Promise<JiraIssue[]>;
  transitions(key: string): Promise<JiraTransition[]>;
  transition(key: string, transitionId: string): Promise<void>;
  remoteLinks(key: string): Promise<{ globalId: string | null; url: string }[]>;
  addRemoteLink(key: string, link: { globalId: string; url: string; title: string }): Promise<void>;
  changelog(key: string): Promise<JiraChange[]>;
  userEmail(accountId: string): Promise<string | null>;
  download(url: string, maxBytes: number): Promise<Buffer>;
}

const s = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const o = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const a = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** 환경 변수에서 인증을 읽는다. 없으면 exit 5 + 어떤 이름을 채우는지 알린다(값은 쓰지 않는다). */
export function jiraCredentials(cfg: Pick<TrackerConfig, "sync">, env: Record<string, string | undefined>): { email: string; token: string } {
  const tokenName = cfg.sync.restTokenEnv ?? "JIRA_API_TOKEN";
  const userName = cfg.sync.restUserEnv ?? "JIRA_USER_EMAIL";
  const token = env[tokenName];
  const email = env[userName];
  if (!token || !email) throw new CliError(EXIT.ENV, `Jira REST 인증이 없다: 환경 변수 ${userName} · ${tokenName} 을 채운다`, "토큰은 리포 · harness-kit.json 에 쓰지 않는다. hx-jira-setup 스킬 참고");
  return { email, token };
}

export function makeJiraClient(baseUrl: string, creds: { email: string; token: string }, opts: HttpOptions = {}): JiraClient {
  const base = checkBaseUrl(baseUrl);
  const auth = Buffer.from(`${creds.email}:${creds.token}`).toString("base64");
  const http: Requester = makeRequester(base, { Authorization: `Basic ${auth}` }, [creds.token, auth], opts);
  const enc = encodeURIComponent;
  const toIssue = (raw: unknown): JiraIssue => {
    const r = o(raw);
    const f = o(r.fields);
    const key = s(r.key);
    return {
      key,
      summary: s(f.summary),
      type: s(o(f.issuetype).name),
      statusId: s(o(f.status).id),
      statusName: s(o(f.status).name),
      description: f.description ?? null,
      attachments: a(f.attachment).map((x) => ({ filename: s(o(x).filename), size: Number(o(x).size ?? 0), url: s(o(x).content) })).filter((x) => x.url),
      updated: s(f.updated),
      webUrl: `${base.origin}/browse/${key}`,
    };
  };
  const FIELDS = "summary,description,issuetype,status,attachment,updated";
  return {
    async issue(key) {
      return toIssue(await http.json("GET", `/rest/api/3/issue/${enc(key)}?fields=${FIELDS}`));
    },
    async children(key) {
      const out: JiraIssue[] = [];
      let token = "";
      for (let page = 0; page < 20; page += 1) {
        const q = `jql=${enc(`parent = ${key} ORDER BY key ASC`)}&fields=${FIELDS}&maxResults=100${token ? `&nextPageToken=${enc(token)}` : ""}`;
        const res = o(await http.json("GET", `/rest/api/3/search/jql?${q}`));
        out.push(...a(res.issues).map(toIssue));
        token = s(res.nextPageToken);
        if (!token) break;
      }
      return out;
    },
    async transitions(key) {
      const res = o(await http.json("GET", `/rest/api/3/issue/${enc(key)}/transitions`));
      return a(res.transitions).map((t) => ({ id: s(o(t).id), name: s(o(t).name), toId: s(o(o(t).to).id) }));
    },
    async transition(key, transitionId) {
      await http.json("POST", `/rest/api/3/issue/${enc(key)}/transitions`, { transition: { id: transitionId } });
    },
    async remoteLinks(key) {
      const res = await http.json("GET", `/rest/api/3/issue/${enc(key)}/remotelink`);
      return a(res).map((l) => ({ globalId: s(o(l).globalId) || null, url: s(o(o(l).object).url) }));
    },
    async addRemoteLink(key, link) {
      await http.json("POST", `/rest/api/3/issue/${enc(key)}/remotelink`, { globalId: link.globalId, object: { url: link.url, title: link.title } });
    },
    async changelog(key) {
      const out: JiraChange[] = [];
      let startAt = 0;
      for (let page = 0; page < 200; page += 1) {
        const res = o(await http.json("GET", `/rest/api/3/issue/${enc(key)}/changelog?startAt=${startAt}&maxResults=100`));
        const values = a(res.values);
        for (const v of values) {
          const item = o(v);
          for (const it of a(item.items)) {
            const i = o(it);
            if (s(i.field) !== "status") continue;
            out.push({ id: s(item.id), created: s(item.created), authorAccountId: s(o(item.author).accountId) || null, from: s(i.from), to: s(i.to) });
          }
        }
        startAt += values.length;
        if (res.isLast === true || values.length === 0 || (typeof res.total === "number" && startAt >= res.total)) break;
      }
      return out;
    },
    async userEmail(accountId) {
      try {
        const res = o(await http.json("GET", `/rest/api/3/user?accountId=${enc(accountId)}`));
        return s(res.emailAddress) || null;
      } catch {
        return null;
      }
    },
    download: (url, maxBytes) => http.bytes(url, maxBytes),
  };
}

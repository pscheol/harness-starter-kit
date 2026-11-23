/** Unit 변경 제안 저장 · 버리기(설계 06 §3.16, DB-R29). units.json 은 바꾸지 않는다. 승인이 아니고 세션에 보내지 않는다. */
import fs from "node:fs";
import path from "node:path";
import { ApiError, notFound, readOnly } from "../errors";
import { applyChanges, findIntent, proposalBody, proposalOf, readUnitsFile } from "../flow";
import type { Project } from "../project";
import { gitUser, resolveIntentCheckout } from "../repo";
import { atomicWrite, nowText, sha256 } from "../util";

export async function postProposal(p: Project, body: unknown): Promise<Record<string, unknown>> {
  if (p.readOnly) throw readOnly();
  const b = proposalBody(body);
  const co = await resolveIntentCheckout(p, b.intent);
  const info = findIntent(co.root, b.intent);
  return p.withLock(path.join(info.abs, "units.proposed.json"), async () => {
    const units = readUnitsFile(info.abs);
    if (!units.raw) throw notFound("units.json 이 없다");
    if (sha256(units.raw) !== b.baseSha256) throw new ApiError(409, "conflict", "units.json 이 바뀌었다. 다시 읽고 제안한다", { currentSha256: sha256(units.raw) });
    const file = path.join(info.abs, "units.proposed.json");
    if (b.proposalSha256 && fs.existsSync(file) && sha256(fs.readFileSync(file)) !== b.proposalSha256) throw new ApiError(409, "conflict", "다른 곳에서 제안을 먼저 저장했다");
    applyChanges(units.units, b.changes);
    const u = await gitUser(co.root, p.env);
    const proposal = { schema: "harness-kit.units-proposal/v1", intent: b.intent, baseSha256: b.baseSha256, createdBy: u.email, createdAt: nowText(), changes: b.changes };
    const text = `${JSON.stringify(proposal, null, 2)}\n`;
    atomicWrite(file, text);
    return { intent: b.intent, path: `${info.dir}/units.proposed.json`, sha256: sha256(Buffer.from(text, "utf8")), changes: b.changes.length };
  });
}

export async function deleteProposal(p: Project, intent: string): Promise<Record<string, unknown>> {
  if (p.readOnly) throw readOnly();
  const co = await resolveIntentCheckout(p, intent);
  const info = findIntent(co.root, intent);
  if (!proposalOf(info.abs)) throw notFound("변경 제안이 없다");
  fs.unlinkSync(path.join(info.abs, "units.proposed.json"));
  return { intent, discarded: true };
}

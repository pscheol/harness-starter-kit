/**
 * 판을 고정해 CLI 를 부르는 명령 안내(npm 에 올리기 전, v2.2 까지).
 * npm 이름 knots-sync 는 아직 등록하지 않았다 — npm 의 그 이름을 판 고정으로 부르라고 안내하면 다른 사람이 올린 패키지를 받을 수 있다.
 */
export const KIT_NPX = "github:pscheol/harness-starter-kit";

/** https://github.com/<owner>/<repo>(.git) 원격이면 그 저장소, 아니면 킷 저장소 */
function npxSpec(source: string | null | undefined): string {
  const gh = source ? /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(source) : null;
  return gh ? `github:${gh[1]}` : KIT_NPX;
}

/** `npx -y github:<owner>/<repo>#v<판> <인자>` */
export function pinnedCli(version: string, args: string, source?: string | null): string {
  return `npx -y ${npxSpec(source)}#v${version} ${args}`;
}

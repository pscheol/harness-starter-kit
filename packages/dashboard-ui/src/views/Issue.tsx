// S03 이슈 상세 전체 화면(/issues/<키>[/docs/<문서>|/review|/approve]).
import type { Route } from "../lib/format";
import { IssueDetail } from "./IssueDetail";

export default function Issue({ route }: { route: Route }) {
  return <IssueDetail issueKey={route.params.key ?? ""} variant="page" tab={route.params.tab ?? null} />;
}

// 모르는 주소. 홈으로 돌아가는 길만 보인다.
import { link } from "../router.js";
import { emptyState } from "../ui.js";

export function render(ctx) {
  ctx.setHeader({ title: "찾을 수 없다", tools: [ctx.searchBox().form] });
  ctx.host.append(emptyState("이 주소의 화면이 없다", `${ctx.route.params.path ?? ""} 는 관리 페이지의 화면이 아니다.`, link("/", { class: "btn sm" }, "홈으로")));
}

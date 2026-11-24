// 미해결 질문 표지 세기(HK-22b) — 템플릿 안내문은 표지가 아니다.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clarifyCount, hasClarify } from "../src/clarify";

const TEMPLATES = path.resolve(__dirname, "../../templates/common/agents-docs/_spec-templates");

describe("clarifyCount", () => {
  it("콜론이 있고 백틱 밖에 있는 표지만 센다", () => {
    expect(clarifyCount("- R1 [NEEDS CLARIFICATION: 보관 기간]\n- R2 [NEEDS CLARIFICATION: 범위] · [NEEDS CLARIFICATION: 권한]\n")).toBe(3);
    expect(clarifyCount("> [NEEDS CLARIFICATION] 규약: 미확정이면 `[NEEDS CLARIFICATION: 구체 질문]` 을 남긴다\n")).toBe(0);
  });

  it("requirements · design 템플릿 그대로는 표지가 없다(새 이슈 문서를 승인할 수 있다)", () => {
    for (const stage of ["requirements", "design"]) {
      const text = fs.readFileSync(path.join(TEMPLATES, stage, "_template.md"), "utf8");
      expect(text).toContain("[NEEDS CLARIFICATION");
      expect(hasClarify(text), stage).toBe(false);
    }
  });
});

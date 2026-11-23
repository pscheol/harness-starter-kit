import { describe, expect, it } from "vitest";
import { loadLayout } from "../src/core/layout";
import { resolveTokens, substitute } from "../src/core/tokens";
import { REAL_TEMPLATES } from "./helpers";

const layout = loadLayout(REAL_TEMPLATES);
const jvm = { stack: "jvm", lang: null };

describe("토큰 값", () => {
  it("기본값: 슬러그는 대상 폴더 이름, 이름 · 서비스는 슬러그, 스택 기본값", () => {
    const t = resolveTokens(layout, jvm, { flags: {}, env: {}, targetBasename: "my-app" });
    expect(t).toEqual({
      PROJECT_NAME: "my-app",
      PROJECT_SLUG: "my-app",
      PACKAGE_NS: "",
      SERVICE_NAME: "my-app",
      PRIMARY_LANGUAGE: "Kotlin/Java",
      BUILD_TOOL: "Gradle",
      TEST_CMD: "./gradlew check",
      DOMAIN_EXAMPLE: "",
      PROTECTED_PATH: "docs/references",
    });
    expect(Object.keys(t)).toEqual(layout.tokens);
  });

  it("lang 이 PRIMARY_LANGUAGE 기본값을 바꾼다", () => {
    expect(resolveTokens(layout, { stack: "jvm", lang: "kotlin" }, { flags: {}, env: {}, targetBasename: "x" }).PRIMARY_LANGUAGE).toBe("Kotlin");
    expect(resolveTokens(layout, { stack: "jvm", lang: "java" }, { flags: {}, env: {}, targetBasename: "x" }).PRIMARY_LANGUAGE).toBe("Java");
  });

  it("플래그 > 환경변수 > 스택 기본값 > tokenDefaults", () => {
    const t = resolveTokens(layout, jvm, {
      flags: { PROJECT_NAME: "Flag" },
      env: { PROJECT_NAME: "Env", PROJECT_SLUG: "env-slug", PRIMARY_LANGUAGE: "Scala", PACKAGE_NS: "" },
      targetBasename: "dir",
    });
    expect(t.PROJECT_NAME).toBe("Flag");
    expect(t.PROJECT_SLUG).toBe("env-slug");
    expect(t.SERVICE_NAME).toBe("env-slug");
    expect(t.PRIMARY_LANGUAGE).toBe("Scala");
    expect(t.PACKAGE_NS).toBe("");
  });

  it("빈 환경변수는 없는 것으로 본다(${V:-기본})", () => {
    const t = resolveTokens(layout, jvm, { flags: {}, env: { PROJECT_SLUG: "", BUILD_TOOL: "" }, targetBasename: "dir" });
    expect(t.PROJECT_SLUG).toBe("dir");
    expect(t.BUILD_TOOL).toBe("Gradle");
  });

  it("표에 없는 스택은 스택 기본값이 없다", () => {
    const t = resolveTokens(layout, { stack: "rust", lang: null }, { flags: {}, env: {}, targetBasename: "r" });
    expect(t.PRIMARY_LANGUAGE).toBe("");
    expect(t.BUILD_TOOL).toBe("");
    expect(t.TEST_CMD).toBe("");
  });
});

describe("치환", () => {
  const order = layout.tokens;
  const sub = (text: string, tokens: Record<string, string>): string => substitute(Buffer.from(text), tokens, order).toString("utf8");

  it("값을 리터럴로 넣는다(& | \\ $& 해석 없음)", () => {
    expect(sub("[{{PROJECT_NAME}}] {{PROJECT_NAME}}", { PROJECT_NAME: "R&D|Lab \\1 $& $1" })).toBe("[R&D|Lab \\1 $& $1] R&D|Lab \\1 $& $1");
  });

  it("빈 값과 목록에 없는 토큰은 남긴다", () => {
    expect(sub("{{PACKAGE_NS}} {{FEATURE_NAME}} {{PRODUCT_SLUG}}", { PACKAGE_NS: "" })).toBe("{{PACKAGE_NS}} {{FEATURE_NAME}} {{PRODUCT_SLUG}}");
  });

  it("목록 순서대로 차례로 바꾼다(sed -e 순서와 같다)", () => {
    expect(sub("{{PROJECT_NAME}}", { PROJECT_NAME: "{{PROJECT_SLUG}}", PROJECT_SLUG: "acme" })).toBe("acme");
    expect(sub("{{PROJECT_SLUG}}", { PROJECT_NAME: "n", PROJECT_SLUG: "{{PROJECT_NAME}}" })).toBe("{{PROJECT_NAME}}");
  });

  it("NUL 바이트가 있는 파일은 바꾸지 않는다", () => {
    const bin = Buffer.from([0x7b, 0x7b, 0x00, ...Buffer.from("{{PROJECT_NAME}}")]);
    expect(substitute(bin, { PROJECT_NAME: "x" }, order).equals(bin)).toBe(true);
  });

  it("UTF-8 본문과 값을 바이트 그대로 다룬다", () => {
    expect(sub("이름: {{PROJECT_NAME}}\n", { PROJECT_NAME: "메모 앱" })).toBe("이름: 메모 앱\n");
  });
});

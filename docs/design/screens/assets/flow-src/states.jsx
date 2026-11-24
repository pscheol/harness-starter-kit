/* 캔버스 자리의 상태 화면: 읽는 중 · 비어 있음 · 읽기 오류 */
import { INTENT } from "./data.js";
import { G, computeLayout } from "./layout.js";

function Icon({ name, style }) {
  return (
    <svg className="i" aria-hidden="true" style={style}>
      <use href={"#i-" + name} />
    </svg>
  );
}

const SKELETON_UNITS = [
  { id: "a", kind: "contract", dependsOn: [] },
  { id: "b", kind: "feature", dependsOn: ["a"] },
  { id: "c", kind: "feature", dependsOn: ["a", "b"] },
  { id: "d", kind: "feature", dependsOn: ["a", "c"] }
];

/** 노드 자리에 뼈대 블록. 실제 배치와 같은 계산을 써서 읽은 뒤 자리가 튀지 않는다. */
export function LoadingCanvas() {
  const layout = computeLayout(SKELETON_UNITS);
  const scale = 0.86;
  return (
    <div className="f-dots f-center" aria-busy="true" aria-label="units.json과 이슈 문서를 읽는 중">
      <div className="sk-stage" style={{ width: layout.width * scale, height: layout.height * scale }}>
        <div className="sk-region" style={{ width: layout.width * scale, height: layout.height * scale }}>
          <span className="sk" style={{ width: 220, height: 14, margin: "20px 0 0 18px" }} />
        </div>
        {SKELETON_UNITS.map((u) => (
          <div
            key={u.id}
            className="sk-node"
            style={{
              left: layout.pos[u.id].x * scale,
              top: layout.pos[u.id].y * scale,
              width: G.NODE_W * scale,
              height: G.NODE_H * scale
            }}
          >
            <span className="sk" style={{ width: "54%" }} />
            <span className="sk" style={{ width: "78%" }} />
            <span className="sk" style={{ width: "40%" }} />
            <span className="sk" style={{ width: "92%", height: 8 }} />
          </div>
        ))}
      </div>
      <p className="sk-note">units.json · 이슈 문서 머리 · 승인 기록 · 검증 결과 · 세션 목록을 읽는 중이다.</p>
    </div>
  );
}

export function EmptyCanvas() {
  return (
    <div className="f-dots f-center">
      <div className="f-msg">
        <Icon name="layers" style={{ width: 28, height: 28, color: "var(--design)" }} />
        <h2>units.json이 아직 없다</h2>
        <p>
          설계 세션이 <span className="mono">/kns-intent {INTENT.key}</span>로 Unit을 나눈다. 나누면 Unit과 의존 순서가 여기에 그려진다.
        </p>
        <p className="path">{INTENT.dir}/units.json</p>
        <div className="f-msg-act">
          <a className="btn go sm" href="S05-dispatch.html">
            <Icon name="send" />
            설계 세션에 요청
          </a>
          <a className="btn sm" href="S04-questions.html">
            Intent 문서 · 질문
          </a>
        </div>
      </div>
    </div>
  );
}

export function ErrorCanvas({ onRetry }) {
  return (
    <div className="f-dots f-center">
      <div className="f-msg">
        <div className="banner err" role="alert">
          <Icon name="alert" />
          <div>
            <b>units.json을 읽지 못했다.</b> 14번째 줄 JSON 형식 오류(쉼표 없음). 흐름을 그릴 수 없어 Unit과 의존을 보이지 않는다.
            <p className="path">{INTENT.dir}/units.json</p>
          </div>
        </div>
        <div className="f-msg-act">
          <button className="btn sm" type="button" onClick={onRetry}>
            <Icon name="refresh" />
            다시 읽기
          </button>
          <a className="btn ghost sm" href="S02-progress.html">
            보드로 보기
          </a>
        </div>
        <p className="f-msg-hint">고치는 일은 설계 세션이 한다. 관리 페이지는 units.json을 쓰지 않는다.</p>
      </div>
    </div>
  );
}

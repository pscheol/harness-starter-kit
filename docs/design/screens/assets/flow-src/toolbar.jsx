/* 캔버스 위 거르기 줄과 캔버스 아래 범례 */
import { useState } from "react";
import { AREAS, STATE_FILTERS, STEPS, READ_AT, PROPOSAL, GATE_FLOOR, GATES_NOW, matchesState, countBy } from "./data.js";
import { Mark } from "./nodes.jsx";

function Seg({ id, label, options, value, onChange, disabled }) {
  return (
    <div className="grp">
      <span className="lbl" id={id}>
        {label}
      </span>
      <div className="seg" role="group" aria-labelledby={id}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={value === o.id ? "true" : "false"}
            onClick={() => onChange(o.id)}
            disabled={disabled}
          >
            {o.label}
            {o.n !== undefined ? <span className="n">{o.n}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

const SRC = {
  default: "units.json · " + READ_AT + "에 읽음",
  proposal: "units.json · " + READ_AT + "에 읽음 · 제안 파일 1",
  loading: "units.json 읽는 중",
  empty: "units.json 없음 · " + READ_AT + " 확인",
  error: "units.json · " + READ_AT + " 읽기 실패"
};

export function Toolbar({ units, area, st, onArea, onSt, matched, disabled, showCounts, mode }) {
  const n = (v) => (showCounts ? v : undefined);
  const areaOpts = [{ id: "all", label: "모두", n: n(units.length) }].concat(
    AREAS.map((a) => ({ id: a, label: a, n: n(countBy(units, (u) => u.area === a)) }))
  );
  const stOpts = STATE_FILTERS.map((s) => ({
    id: s.id,
    label: s.label,
    n: s.id === "all" ? undefined : n(countBy(units, (u) => matchesState(u, s.id)))
  }));
  const active = area !== "all" || st !== "all";
  return (
    <div className="f-bar">
      <div className="f-filters" data-co="1">
        <Seg id="f-area" label="영역" options={areaOpts} value={area} onChange={onArea} disabled={disabled} />
        <Seg id="f-st" label="상태" options={stOpts} value={st} onChange={onSt} disabled={disabled} />
      </div>
      <p className="result" aria-live="polite">
        {active ? (
          <>
            <span>
              Unit {units.length}개 중 <b>{matched}</b>개
              {matched === 0 ? " · 조건에 맞는 Unit 없음" : ""}
            </span>
            <button
              className="btn ghost sm"
              type="button"
              onClick={() => {
                onArea("all");
                onSt("all");
              }}
            >
              거르기 풀기
            </button>
          </>
        ) : null}
      </p>
      <p className="src">{SRC[mode] || SRC.default}</p>
    </div>
  );
}

function Icon({ name }) {
  return (
    <svg className="i" aria-hidden="true">
      <use href={"#i-" + name} />
    </svg>
  );
}

const TOOLS = [
  { id: "add", icon: "link", label: "의존 더하기", hint: "먼저 끝날 Unit을 누르고, 기다릴 Unit을 누른다." },
  { id: "remove", icon: "unlink", label: "의존 빼기", hint: "뺄 선의 양 끝 Unit을 차례로 누른다." },
  { id: "split", icon: "split", label: "나누기", hint: "나눌 Unit을 누르면 새 Unit 키와 제목을 묻는다." },
  { id: "merge", icon: "merge", label: "합치기", hint: "합칠 Unit 둘을 누른다. 계약 Unit은 합치지 않는다." },
  { id: "order", icon: "reorder", label: "순서 바꾸기", hint: "Unit을 누르고 화살표로 같은 열 안의 순서를 바꾼다." }
];

/** 편집 도구줄(?state=proposal): 고친 것은 units.json이 아니라 제안 파일로 저장한다. PIN 없음 · 승인 아님 · 세션에 보내지 않음 */
export function EditBar({ readonly }) {
  const [tool, setTool] = useState("add");
  const cur = TOOLS.find((t) => t.id === tool);
  const save = () =>
    window.HX && window.HX.toast(PROPOSAL.file + "에 저장했다 · 바뀐 곳 " + PROPOSAL.changes.length + " · 승인이 아니다 · 세션에 보내지 않았다");
  return (
    <div className="f-edit" data-co="10">
      <span className="lbl" id="f-tools">편집 · 제안으로 저장</span>
      <div className="seg f-tools" role="group" aria-labelledby="f-tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tool === t.id ? "true" : "false"}
            onClick={() => setTool(t.id)}
            disabled={readonly}
            title={t.hint}
          >
            <Icon name={t.icon} />
            {t.label}
          </button>
        ))}
      </div>
      <p className="f-hint">{cur ? cur.hint : ""}</p>
      <div className="f-edit-act">
        <span className="f-chg">
          바뀐 곳 <b>{PROPOSAL.changes.length}</b>
        </span>
        <button className="btn ghost sm" type="button" disabled={readonly}>
          되돌리기
        </button>
        <button className="btn primary sm" type="button" onClick={save} disabled={readonly} title="PIN이 필요 없다 · 제안은 승인이 아니다">
          <Icon name="save" />
          제안 저장
        </button>
        <a
          className="f-tpl"
          href="S09-harness.html"
          title={"흐름 틀(flow.gates)은 팀 설정이라 여기서 바꾸지 않는다 · 지금 게이트 " + GATES_NOW.length + "개 · 바닥 " + GATE_FLOOR.length + "개(" + GATE_FLOOR.join(" · ") + ") · 터미널 명령(flow gates --add …) 뒤 MR로 올린다"}
        >
          흐름 틀 · flow.gates
        </a>
      </div>
    </div>
  );
}

/** 변경 제안 띠(?state=proposal) */
export function ProposalBanner() {
  return (
    <div className="f-prop" data-co="9" role="status">
      <Icon name="pencil" />
      <p>
        <b>변경 제안 대기</b> · <span className="mono">{PROPOSAL.file}</span> · intent 게이트 승인 뒤 반영
        <span className="f-prop-sub">
          {" "}
          · 바뀐 곳 {PROPOSAL.changes.length} · {PROPOSAL.at} 저장 · 지금 캔버스는 units.json 그대로이고 제안은 파란 점선이다
        </span>
      </p>
    </div>
  );
}

export function Legend({ proposal }) {
  return (
    <div className="f-legend">
      <div className="lg-wrap" data-co="7" role="group" aria-label="범례">
      <span className="lg">
        <b>단계</b>
        {STEPS.map((st) => (
          <span key={st.id} className="lg-i">
            <Mark step={st} state="ok" />
            {st.label}
          </span>
        ))}
      </span>
      <span className="lg">
        <b>색</b>
        <span className="lg-i">
          <i className="sw design" aria-hidden="true" />
          설계
        </span>
        <span className="lg-i">
          <i className="sw build" aria-hidden="true" />
          구현 · 검증
        </span>
        <span className="lg-i">
          <i className="sw ops" aria-hidden="true" />
          반영 · 운영
        </span>
        <span className="lg-i">
          <Mark step={STEPS[1]} state="wait" />
          빨강 · 사람 승인 대기 · 실패
        </span>
      </span>
      <span className="lg">
        <b>모양</b>
        <span className="lg-i">
          <Mark step={STEPS[0]} state="todo" />
          사람이 승인하는 자리
        </span>
        <span className="lg-i">
          <Mark step={STEPS[3]} state="todo" />
          작업 단계
        </span>
        <span className="lg-i">
          <Mark step={STEPS[3]} state="now" />
          진행 중
        </span>
        <span className="lg-i">
          <svg className="ln" width="28" height="10" aria-hidden="true">
            <line x1="1" y1="5" x2="27" y2="5" />
          </svg>
          의존 · 앞 → 뒤
        </span>
        <span className="lg-i">
          <svg className="ln contract" width="28" height="10" aria-hidden="true">
            <line x1="1" y1="5" x2="27" y2="5" />
          </svg>
          점선 · 계약
        </span>
        {proposal ? (
          <span className="lg-i">
            <svg className="ln proposed" width="28" height="10" aria-hidden="true">
              <line x1="1" y1="5" x2="27" y2="5" />
            </svg>
            파란 점선 · 변경 제안(아직 반영 안 됨)
          </span>
        ) : null}
      </span>
      </div>
    </div>
  );
}

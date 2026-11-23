/* 오른쪽 판: 고른 Unit의 상태 · 처리할 일 · 게이트 · 연결 · 행동. 고른 것이 없으면 Intent 요약. */
import { useEffect, useRef } from "react";
import { ME, INTENT, READ_AT, STEPS, STEP_STATE_KO, HARNESS, PROPOSAL, GATE_FLOOR, GATES_NOW, FLOW_GATES_CMD, BURN, boltOf, stepState, stepNote, countBy } from "./data.js";
import { Mark } from "./nodes.jsx";
import { topoOrder } from "./layout.js";

function Icon({ name }) {
  return (
    <svg className="i" aria-hidden="true">
      <use href={"#i-" + name} />
    </svg>
  );
}

function canApprove(unit) {
  if (!unit.approval) return false;
  return unit.approval.approvers.some((g) => ME.groups.includes(g));
}

function TodoList({ items, onPick }) {
  if (!items.length) {
    return <p className="dp-none">처리할 일 없음</p>;
  }
  return (
    <ul className="todo">
      {items.map((t) => (
        <li key={t.key || t.title}>
          <span className="dia" aria-hidden="true" />
          <div className="grow">
            {t.unit ? (
              <p className="todo-k">
                <span className="key">{t.unit.issue}</span>
                <span className="u-id">{t.unit.id}</span>
              </p>
            ) : null}
            <p className="todo-t">{t.title}</p>
            <p className="todo-w">{t.why}</p>
          </div>
          {onPick ? (
            <button className="btn sm" type="button" onClick={() => onPick(t.unit.id)} aria-label={t.unit.id + " 노드 보기"}>
              보기
            </button>
          ) : (
            <a className="btn sm" href={t.href}>
              {t.act}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

function StepList({ unit }) {
  return (
    <ol className="steps">
      {STEPS.map((st) => {
        const state = stepState(unit, st.id);
        return (
          <li key={st.id} className={state}>
            <Mark step={st} state={state} size="lg" />
            <span className="st-n">{st.label}</span>
            <span className="st-s">
              {st.gate || state !== "ok" ? STEP_STATE_KO[state] : "끝"}
              {stepNote(unit, st.id) ? <span className="st-note"> · {stepNote(unit, st.id)}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Links({ unit, units }) {
  const byId = new Map(units.map((u) => [u.id, u]));
  const before = unit.dependsOn.map((id) => byId.get(id)).filter(Boolean);
  const after = units.filter((u) => u.dependsOn.includes(unit.id));
  const h = unit.session ? HARNESS[unit.session.h] : null;
  return (
    <dl className="dp-dl">
      <dt>세션</dt>
      <dd>
        {unit.session ? (
          <>
            <span className="harness">
              <b className={unit.session.h}>{h[0]}</b>
              <span className="mono">{unit.session.name}</span>
            </span>
            <span className="dp-more">
              {h[1]} · {unit.session.state}
            </span>
          </>
        ) : (
          <span className="muted">없음</span>
        )}
      </dd>
      {unit.kind === "contract" ? (
        <>
          <dt>주는 계약</dt>
          <dd className="mono small">{unit.provides.join(" · ")}</dd>
        </>
      ) : null}
      <dt>먼저 끝날 것</dt>
      <dd>
        {before.length
          ? before.map((b) => (
              <span key={b.id} className="dp-ref">
                <span className="key">{b.issue}</span> {b.kind === "contract" ? "계약 · " : ""}
                {b.title}
              </span>
            ))
          : <span className="muted">없음</span>}
      </dd>
      <dt>기다리는 Unit</dt>
      <dd>
        {after.length
          ? after.map((a) => (
              <span key={a.id} className="dp-ref">
                <span className="key">{a.issue}</span> {a.title}
              </span>
            ))
          : <span className="muted">없음</span>}
      </dd>
      {unit.branch ? (
        <>
          <dt>브랜치</dt>
          <dd className="path">{unit.branch}</dd>
        </>
      ) : null}
    </dl>
  );
}

function Actions({ unit, readonly }) {
  const ok = !readonly && canApprove(unit);
  const why = readonly ? "읽기 전용 · 에이전트 세션에서 연 관리 페이지는 승인을 받지 않는다" : unit.approveWhy;
  return (
    <div className="dp-foot">
      <div className="dp-btns">
        <a className="btn sm" href="S03-issue.html">
          <Icon name="doc" />
          열기
        </a>
        {readonly ? (
          <button className="btn sm" type="button" disabled title="읽기 전용 · 세션에 요청을 보내지 않는다">
            <Icon name="send" />
            세션에 요청
          </button>
        ) : (
          <a className="btn sm" href="S05-dispatch.html">
            <Icon name="send" />
            세션에 요청
          </a>
        )}
        {ok ? (
          <a className="btn approve sm" href="S03-issue.html">
            <Icon name="check" />
            승인 (PIN)
          </a>
        ) : (
          <button className="btn approve sm" type="button" disabled aria-describedby="dp-why">
            <Icon name="lock" />
            승인 (PIN)
          </button>
        )}
      </div>
      {ok ? null : (
        <p className="dp-why" id="dp-why">
          <Icon name="fail" />
          <span>{why}</span>
        </p>
      )}
      <p className="ident">
        <Icon name="commit" />
        <span>
          승인은 git user.email <b>{ME.email}</b>로 기록된다
        </span>
      </p>
    </div>
  );
}

export function UnitDetail({ unit, units, readonly, onClose, closeRef }) {
  const contract = unit.kind === "contract";
  const tone = unit.status.tone === "none" ? "" : unit.status.tone;
  return (
    <>
      <div className="dp-body">
        <div className="dp-head">
          <p className="dp-keys">
            {contract ? <span className="chip-contract">계약</span> : null}
            <span className="key">{unit.issue}</span>
            <span className="u-id">{unit.id}</span>
            <span className="u-area">{unit.area}</span>
          </p>
          <h2 id="dp-title" tabIndex={-1}>
            {unit.title}
          </h2>
          <button className="btn ghost sm dp-close" type="button" onClick={onClose} ref={closeRef} aria-label="고르기 풀기 · Intent 요약으로">
            <Icon name="x" />
          </button>
          <p className="dp-tags">
            <span className={"tag " + tone}>{unit.status.text}</span>
            {unit.bolts ? (
              <span className="tag line">
                Bolt {unit.bolts[0]}/{unit.bolts[1]}
              </span>
            ) : null}
            {unit.blocking ? <span className="tag solid-gate">{unit.blocking}</span> : null}
            {unit.question ? <span className="tag gate">{unit.question}</span> : null}
          </p>
        </div>
        <section className="dp-sec" aria-labelledby="dp-todo">
          <h3 id="dp-todo">
            처리할 일 <span className="n">{unit.todos.length}</span>
          </h3>
          <TodoList items={unit.todos} />
        </section>
        <section className="dp-sec" aria-labelledby="dp-gates">
          <h3 id="dp-gates">게이트</h3>
          <StepList unit={unit} />
        </section>
        <section className="dp-sec" aria-labelledby="dp-links">
          <h3 id="dp-links">연결</h3>
          <Links unit={unit} units={units} />
        </section>
      </div>
      <Actions unit={unit} readonly={readonly} />
    </>
  );
}

/** Unit의 Bolt 칸: 끝 = 앰버, 지금 = 옅은 앰버, 남음 = 회색, 추정(tasks 없음) = 빈 칸 */
function BoltCells({ unit }) {
  const b = boltOf(unit);
  const now = unit.flags.active;
  const cells = [];
  for (let i = 0; i < b.all; i++) {
    let c = "";
    if (i < b.done) c = "done";
    else if (now && i === b.done) c = "now";
    else if (b.est) c = "est";
    cells.push(<i key={i} className={c || undefined} />);
  }
  return (
    <span className="order-bolt">
      <span className="bolts" role="img" aria-label={"Bolt " + b.done + "/" + b.all + (b.est ? " 추정" : "")}>
        {cells}
      </span>
      <span className="order-bn">
        {b.done}/{b.all}
        {b.est ? " 추정" : ""}
      </span>
    </span>
  );
}

/** 남은 일: 남은 Bolt 14일 계단선(차트는 assets/viz.js가 그린다 · 값은 모두 aria-label에) */
function BurnSection({ units }) {
  const chartRef = useRef(null);
  const all = units.reduce((n, u) => n + boltOf(u).all, 0);
  const done = units.reduce((n, u) => n + boltOf(u).done, 0);
  const fin = units.filter((u) => boltOf(u).all > 0 && boltOf(u).done === boltOf(u).all).length;
  useEffect(() => {
    const V = window.HXViz;
    if (!V || !chartRef.current) return undefined;
    const days = V.days(BURN.end[0], BURN.end[1], BURN.left.length);
    const name = (d) => d.m + "월 " + d.d + "일 " + d.w;
    const last = BURN.left.length - 1;
    const draw = () =>
      V.line(chartRef.current, {
        h: 76,
        m: { l: 22, r: 22, t: 16, b: 18 },
        values: BURN.left,
        step: true,
        y: { min: 0, max: 12, ticks: [0, 6, 12] },
        labels: days.map(name),
        xTicks: [
          [0, days[0].m + "-" + days[0].d, "start"],
          [last, "오늘", "end", true]
        ],
        events: [BURN.event],
        endLabel: (v) => String(v),
        tip: (i) => {
          const rows = [{ v: String(BURN.left[i]), n: "남은 Bolt", key: "ink" }];
          if (BURN.notes[i]) rows.push({ v: "", n: BURN.notes[i], sub: true });
          return rows;
        },
        label:
          INTENT.key + " 남은 Bolt 14일, " +
          days.map((d, i) => d.m + "월 " + d.d + "일 " + BURN.left[i] + (BURN.notes[i] ? "(" + BURN.notes[i] + ")" : "")).join(", ") +
          ". 왼쪽 오른쪽 화살표로 날마다 본다."
      });
    draw();
    let t;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(draw, 150);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return (
    <section className="dp-sec dp-burn" aria-labelledby="dp-burn" data-co="13">
      <h3 id="dp-burn">
        남은 일 <span className="h3-note">남은 Bolt · 14일</span>
      </h3>
      <p className="burn-sum">
        <b>{all - done}</b> / {all} Bolt 남음 · 끝난 Unit {fin}/{units.length}
      </p>
      <div className="vz" ref={chartRef} />
      <p className="dp-hint">tasks가 없는 Unit은 units.json 추정 Bolt 수로 센다(아래 빈 칸).</p>
    </section>
  );
}

const OVERVIEW_HEAD = {
  default: {
    tag: "intent 승인됨",
    tone: "ops",
    file: READ_AT + "에 읽음 · 자리는 dependsOn, 상태는 이슈 문서 · 승인 기록 · 검증 결과에서 계산한다."
  },
  empty: {
    tag: "intent 작성 중",
    tone: "design",
    sub: "Unit 아직 없음 · intent 게이트 전",
    file: "아직 없다 · 설계 세션이 /hx-intent로 만든다."
  },
  error: {
    tag: "units.json 오류",
    tone: "gate",
    sub: "Unit 수를 알 수 없음",
    file: READ_AT + "에 읽기 실패 · 14번째 줄 JSON 형식 오류."
  }
};

/** 변경 제안(?state=proposal): 무엇을 바꾸자는지 · 누가 저장했는지 · 언제 반영되는지 */
function ProposalSection({ units }) {
  const byId = new Map(units.map((u) => [u.id, u]));
  const name = (id) => (byId.get(id) ? byId.get(id).issue : id);
  return (
    <section className="dp-sec dp-prop" aria-labelledby="dp-prop" data-co="12">
      <h3 id="dp-prop">
        변경 제안 <span className="n">{PROPOSAL.changes.length}</span>
        <span className="h3-note mono">{PROPOSAL.file}</span>
      </h3>
      <ul className="prop-list">
        {PROPOSAL.changes.map((c) => (
          <li key={c.op + c.from + c.to}>
            <span className={"prop-op " + c.op}>
              <Icon name={c.op === "add" ? "link" : "unlink"} />
              {c.op === "add" ? "의존 더하기" : "의존 빼기"}
            </span>
            <p className="prop-t">
              <span className="u-id">{c.from}</span> → <span className="u-id">{c.to}</span>{" "}
              <span className="key">{name(c.to)}</span>
              {c.label ? " · " + c.label : ""}
            </p>
            <p className="todo-w">{c.why}</p>
          </li>
        ))}
      </ul>
      <dl className="dp-dl">
        <dt>저장</dt>
        <dd>
          {PROPOSAL.at} · <span className="mono small">{PROPOSAL.by}</span>
          <span className="dp-more">기준 {PROPOSAL.base}</span>
        </dd>
        <dt>반영</dt>
        <dd>
          intent 게이트 승인 뒤 · approvers <b className="mono">{PROPOSAL.approvers}</b> · PIN
          <span className="dp-more">승인되면 킷이 units.json에 옮기고 이 파일을 지운다</span>
        </dd>
      </dl>
      <p className="dp-hint">
        제안 저장은 PIN을 묻지 않는다. 제안은 승인이 아니다. 저장해도 세션에는 아무것도 보내지 않는다.
      </p>
      <p className="dp-hint">
        흐름 틀(<a href="S09-harness.html">flow.gates</a>)은 팀 설정이라 여기서 바꾸지 않는다. 지금 게이트 {GATES_NOW.length}개와 바닥{" "}
        {GATE_FLOOR.length}개({GATE_FLOOR.join(" · ")})를 보이고, 바꾸려면 터미널 명령 뒤 MR로 올린다. 바닥 아래로 줄이는 명령은 거부된다.
      </p>
      <p className="dp-hint">
        <code>{FLOW_GATES_CMD}</code>{" "}
        <button
          className="btn sm"
          type="button"
          onClick={() => {
            if (navigator.clipboard) navigator.clipboard.writeText(FLOW_GATES_CMD).catch(() => {});
            if (window.HX) window.HX.toast("복사했다 · " + FLOW_GATES_CMD + " · harness-kit.json을 고쳐 MR로 올린다");
          }}
        >
          명령 복사
        </button>
      </p>
    </section>
  );
}

export function IntentOverview({ units, onPick, mode, isMatch, proposal, readonly }) {
  const all = units.flatMap((u) => u.todos.map((t) => ({ ...t, unit: u, key: u.id + t.title })));
  const todos = isMatch ? all.filter((t) => isMatch(t.unit.id)) : all;
  const filtered = todos.length !== all.length;
  const order = topoOrder(units);
  const head = OVERVIEW_HEAD[mode] || OVERVIEW_HEAD.default;
  const contracts = countBy(units, (u) => u.kind === "contract");
  return (
    <>
      <div className="dp-body">
        <div className="dp-head">
          <p className="dp-keys">
            <span className="key">{INTENT.key}</span>
            <span className={"tag " + head.tone}>{head.tag}</span>
          </p>
          <h2 id="dp-title">{INTENT.title}</h2>
          <p className="dp-sub">
            {INTENT.design} · {mode === "default" ? "Unit " + units.length + " · 계약 " + contracts + " · " + INTENT.approved + " 승인" : head.sub}
          </p>
        </div>
        {proposal ? <ProposalSection units={units} /> : null}
        {mode === "error" ? (
          <section className="dp-sec">
            <p className="dp-none">Unit을 읽지 못해 처리할 일과 의존 순서를 셀 수 없다.</p>
          </section>
        ) : (
          <>
            <section className="dp-sec" aria-labelledby="dp-todo">
              <h3 id="dp-todo">
                처리할 일 <span className="n">{filtered ? todos.length + " / " + all.length : todos.length}</span>
                {filtered ? <span className="h3-note">거르기 적용</span> : null}
              </h3>
              <TodoList items={todos} onPick={units.length ? onPick : null} />
            </section>
            {units.length ? <BurnSection units={units} /> : null}
            <section className="dp-sec" aria-labelledby="dp-order">
              <h3 id="dp-order">의존 순서</h3>
              {order.length ? (
                <ol className="order">
                  {order.map((u) => (
                    <li key={u.id}>
                      <button type="button" className="order-b" onClick={() => onPick(u.id)}>
                        <span className="u-id">{u.id}</span>
                        <span className="order-t">
                          <span className="key">{u.issue}</span> {u.kind === "contract" ? "계약 · " : ""}
                          {u.title}
                        </span>
                        <span className={"order-s " + u.status.tone}>{u.status.text}</span>
                        <BoltCells unit={u} />
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="dp-none">Unit이 없다.</p>
              )}
              {order.length ? <p className="dp-hint">선은 먼저 끝나야 하는 Unit에서 기다리는 Unit으로 간다.</p> : null}
            </section>
          </>
        )}
        <section className="dp-sec" aria-labelledby="dp-src">
          <h3 id="dp-src">읽은 파일</h3>
          <p className="path">{INTENT.dir}/units.json</p>
          <p className="dp-hint">{head.file} 관리 페이지는 이 파일을 쓰지 않는다.</p>
        </section>
      </div>
      <div className="dp-foot">
        {proposal ? (
          <>
            <div className="dp-btns">
              <a className="btn sm" href="S04-questions.html">
                <Icon name="doc" />
                intent 게이트 열기
              </a>
              {readonly ? (
                <button className="btn sm" type="button" disabled title="읽기 전용 · 세션에 요청을 보내지 않는다">
                  <Icon name="send" />
                  세션에 요청
                </button>
              ) : (
                <a className="btn sm" href="S05-dispatch.html">
                  <Icon name="send" />
                  세션에 요청
                </a>
              )}
              <button
                className="btn ghost sm"
                type="button"
                disabled={readonly}
                onClick={() => window.HX && window.HX.toast(PROPOSAL.file + "를 지웠다 · units.json은 그대로다")}
              >
                <Icon name="trash" />
                제안 버리기
              </button>
            </div>
            <p className="ident">
              <Icon name="commit" />
              <span>
                제안은 git user.email <b>{ME.email}</b>로 남는다
              </span>
            </p>
          </>
        ) : (
          <div className="dp-btns">
            <a className="btn sm" href="S04-questions.html">
              <Icon name="question" />
              Intent 문서 · 질문
            </a>
          </div>
        )}
      </div>
    </>
  );
}

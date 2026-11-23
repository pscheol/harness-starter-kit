"""Stop hook 이 에이전트에게 넘길 짧은 검증 요약(설계 01 §3.3, 40줄 이하).

파일·명령 목록 전체는 기본 JSON 출력(`--plan`·실행 결과)에만 남긴다. hook 이 JSON 을 그대로 넘기면
판정마다 수천 줄이 에이전트 문맥에 실린다.
"""

MAX_ITEMS = 20
MAX_EXAMPLES = 3
MAX_LINES = 40
TAIL_LINES = 15
LINE_WIDTH = 240
PLAN_HINT = "전체 목록: python3 scripts/verify-changed.py --plan"

# 미완료 이유(";" 앞)의 화면 이름. 없으면 이유 문장을 그대로 쓴다.
REASON_LABEL = {
    "no related test found": "관련 테스트 없음",
    "file not found and unknown to git": "경로 없음",
}
# 미검증 이유 → 화면 문장(설계 01 §3.3).
UNVERIFIED_TEXT = {
    "no-module-test": "관련 테스트와 모듈 테스트가 없다. 테스트를 추가하거나 --tests 로 지정한다",
    "zero-tests": "모듈 시험이 테스트를 하나도 돌리지 않았다. 테스트를 추가하거나 --tests 로 지정한다",
    "build-contract": "빌드 계약 파일이다. bash scripts/verify.sh --affected 로 빌드 루트를 검사한다",
}
UNVERIFIED_LABEL = {"build-contract": "빌드 계약"}


def name_of(path):
    return path.rsplit("/", 1)[-1]


def examples(names):
    shown = names[:MAX_EXAMPLES]
    rest = len(names) - len(shown)
    return ", ".join(shown) + (f" 외 {rest}개" if rest > 0 else "")


def grouped_incomplete(items):
    """미완료 항목("대상: 이유; 안내")을 이유별로 묶는다. 처음 나온 이유 순서를 지킨다."""
    groups = {}
    for item in items:
        target, _, rest = item.partition(": ")
        reason = rest.split(";")[0].strip() or item
        groups.setdefault(reason, []).append(target)
    return groups


def unverified_lines(items):
    groups = {}
    for item in items:
        groups.setdefault(item.get("reason", "no-module-test"), []).append(name_of(item.get("file", "?")))
    return [
        f"- {UNVERIFIED_LABEL.get(reason, '미검증')} {len(names)}개: {examples(names)} — {UNVERIFIED_TEXT.get(reason, reason)}"
        for reason, names in groups.items()
    ]


def incomplete_lines(items, unverified):
    """이유마다 한 줄: 개수와 예시 파일 이름 몇 개. 파일마다 한 줄씩 늘어놓으면 Stop hook 출력이 수십 줄이 된다."""
    lines = [f"미완료 {len(items) + len(unverified)}개 — {PLAN_HINT}"]
    for reason, targets in grouped_incomplete(items).items():
        lines.append(f"- {REASON_LABEL.get(reason, reason)} {len(targets)}개: {examples([name_of(target) for target in targets])}")
    return lines + unverified_lines(unverified)


def widened_line(items):
    """관련 테스트가 없어 모듈 시험으로 넓힌 파일. 빌드 계약 · 단위 게이트로 넓힌 것도 같은 줄에 센다."""
    pairs = []
    for item in items:
        if item.get("reason") == "no-related-test":
            pairs.append(f"{name_of(item['file'])} → {item.get('test') or item.get('module')}")
        elif item.get("reason") == "build-contract":
            pairs.append(f"{name_of(item['file'])} → {item.get('build', '.')} 전체")
        elif item.get("reason") == "no-module-graph":
            pairs.append(f"단위 {item.get('unit')} → 단위 게이트")
    return f"넓힘 {len(pairs)}개: {examples(pairs)}" if pairs else None


def output_tail(text):
    return [line[:LINE_WIDTH] for line in (text or "").strip().splitlines()[-TAIL_LINES:]]


def failed_results(result):
    return [item for item in result.get("results", []) if item.get("exit_code") not in (0, None)]


def headline(result):
    status = result.get("status", "incomplete")
    counts = f"변경 파일 {len(result.get('files', []))}개, 계획 명령 {len(result.get('commands', []))}개, 실행 {len(result.get('results', []))}개"
    verdict = "" if status == "passed" else " 이번 호출은 통과가 아니다."
    return f"검증 {status}({result.get('level', '-')}) — {counts}.{verdict}"


def summary_text(result):
    if "error" in result:
        return f"검증 {result.get('status', 'incomplete')}({result.get('level', '-')}) — 오류: {result['error']}. 이번 호출은 통과가 아니다."
    lines = [headline(result)]
    lines.extend((result.get("analysis") or {}).get("lines", []))  # 정적 분석 요약(15줄 이하, 설계 09 §3.4)
    incomplete, unverified = result.get("incomplete", []), result.get("unverified", [])
    if incomplete or unverified:
        lines.extend(incomplete_lines(incomplete, unverified))
    widened = widened_line(result.get("widened", []))
    if widened:
        lines.append(widened)
    lines.extend(f"↷ {item['id']} 건너뜀 — 변경 없음" for item in result.get("skippedUnits", [])[:MAX_ITEMS])
    budget = [item for item in result.get("skipped", []) if "budget" in item]
    if budget:
        lines.append(f"시간 상한으로 안 돈 명령 {len(budget)}개: {examples([item.split(':', 1)[0] for item in budget])}")
    failures = failed_results(result)
    if failures:
        lines.append(f"실패 {len(failures)}개:")
        for item in failures[:MAX_ITEMS]:
            lines.append(f"- {item.get('unit')} {item.get('kind')} (exit {item.get('exit_code')}):")
            lines.extend(f"    {line}" for line in output_tail(item.get("output")))
    recommendations = result.get("recommendations", [])
    if recommendations:
        lines.append(f"권고 {len(recommendations)}개(통과 판정에는 들어가지 않는다):")
        lines.extend(f"- {item}" for item in recommendations[:MAX_ITEMS])
    if len(lines) > MAX_LINES:
        lines = lines[: MAX_LINES - 1] + [f"… {len(lines) - MAX_LINES + 1}줄 줄임 — 전체 결과는 python3 scripts/verify-changed.py 의 JSON 출력에 있다"]
    return "\n".join(lines)

"""Stop hook 이 에이전트에게 넘길 짧은 검증 요약.

파일·명령 목록 전체는 기본 JSON 출력(`--plan`·실행 결과)에만 남긴다. hook 이 JSON 을 그대로 넘기면
판정마다 수천 줄이 에이전트 문맥에 실린다.
"""

MAX_ITEMS = 20
MAX_EXAMPLES = 3
TAIL_LINES = 15
LINE_WIDTH = 240
PLAN_HINT = "전체 목록: python3 scripts/verify-changed.py --plan"

# 미완료 이유(";" 앞)의 화면 이름. 없으면 이유 문장을 그대로 쓴다.
REASON_LABEL = {"no related test found": "관련 테스트 없음"}


def grouped_incomplete(items):
    """미완료 항목("대상: 이유; 안내")을 이유별로 묶는다. 처음 나온 이유 순서를 지킨다."""
    groups = {}
    for item in items:
        target, _, rest = item.partition(": ")
        reason = rest.split(";")[0].strip() or item
        groups.setdefault(reason, []).append(target)
    return groups


def incomplete_lines(items):
    """이유마다 한 줄: 개수와 예시 파일 이름 몇 개. 파일마다 한 줄씩 늘어놓으면 Stop hook 출력이 수십 줄이 된다."""
    lines = [f"미완료 {len(items)}개 — {PLAN_HINT}"]
    for reason, targets in grouped_incomplete(items).items():
        names = [target.rsplit("/", 1)[-1] for target in targets[:MAX_EXAMPLES]]
        rest = len(targets) - len(names)
        tail = f" 외 {rest}개" if rest > 0 else ""
        lines.append(f"- {REASON_LABEL.get(reason, reason)} {len(targets)}개: {', '.join(names)}{tail}")
    return lines


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
        return f"검증 {result.get('status', 'incomplete')} — 오류: {result['error']}. 이번 호출은 통과가 아니다."
    lines = [headline(result)]
    incomplete = result.get("incomplete", [])
    if incomplete:
        lines.extend(incomplete_lines(incomplete))
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
    return "\n".join(lines)

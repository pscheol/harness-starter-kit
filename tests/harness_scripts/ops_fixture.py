"""배포 · 운영 시험의 공통 준비(HK-21). 이슈 폴더 · 승인 기록 · deploy.json · 가짜 배포 명령을 만든다.

파일 이름이 test_ 로 시작하지 않아 discover 대상이 아니다.
"""

import json
import subprocess
import sys
from pathlib import Path

from sdd_fixture import SddCase

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness import approvals  # noqa: E402
from harness.sdd_frontmatter import update  # noqa: E402

GOOD_DESIGN = """## 13. 배포 · 롤백 (Migration / Rollout)

### 13.1 배포 계획 *(필수)*
| 항목 | 값 |
|---|---|
| 순서 | 1 마이그레이션 expand → 2 API 배포 |
| 방식 | 단계적(10% → 100%, 30분 간격) |
| 하위 호환 | 이전 판 클라이언트와 함께 돈다 |
| 마이그레이션 | 되돌릴 수 있음 |
| 확인 신호 | 스모크: curl /health · 헬스: curl /ready · 지표: 결제 실패율 ≤ 0.5% |

### 13.2 롤백 *(필수)*
| 항목 | 값 |
|---|---|
| 방법 | 플래그 끄기 → 이전 커밋 재배포 |
| 판단 기준 | 5xx 비율 1% 초과가 5분 이어짐 |
| 데이터 | 롤백 뒤 남는 주문은 그대로 둔다 |
| 시험 | 검증 환경에서 시험한다 |

### 13.3 운영 점검
- [x] 로그: 개인정보 없음
- [x] 지표: 결제 실패율 https://grafana.example/d/pay
- [ ] 알람: 해당 없음: 알람 기준은 기존 것을 그대로 쓴다
- [x] SLO: 가용성 99.9% / 30일
- [x] 런북: https://wiki.example/runbooks/payment
- [ ] 비밀값: 해당 없음: 새 비밀값 없음
- [ ] 환경 차이: 해당 없음: 검증과 운영 설정이 같다
"""

NO_DEPLOY_DESIGN = "## 13. 배포 · 롤백 (Migration / Rollout)\n\n배포 없음: 내부 라이브러리\n"

STUB = """import os, sys
step = sys.argv[1]
with open("calls.log", "a", encoding="utf-8") as handle:
    handle.write(" ".join(sys.argv[1:]) + "\\n")
sys.exit(1 if os.path.exists(f"ops/fail-{step}") else 0)
"""


def deploy_json(auto=True, limit=2):
    stub = lambda *extra: ["python3", "ops/stub.py", *extra]  # noqa: E731
    return {"schema": "knots-sync.deploy/v1",
            "envs": {"verify": {"kind": "verification", "url": "https://verify.example.internal"}, "production": {"kind": "production"}},
            "commands": {"deploy": stub("deploy", "{env}", "{sha}"), "smoke": stub("smoke", "{env}"), "health": stub("health", "{env}"),
                         "rollback": stub("rollback", "{env}", "{toSha}"), "e2e": stub("e2e", "{url}")},
            "autoVerify": {"enabled": auto, "env": "verify", "maxConsecutiveFailures": limit, "timeoutSec": 60}}


class OpsCase(SddCase):
    """develop 브랜치 리포 + 이슈 + 가짜 배포 명령."""

    def setUp(self):
        super().setUp()
        self.env = {key: value for key, value in self.env.items() if not key.startswith(("CLAUDE", "CODEX_", "KIRO_", "CURSOR_AGENT"))}
        self.deploy_config(True)
        (self.root / "ops").mkdir(exist_ok=True)
        (self.root / "ops/stub.py").write_text(STUB, encoding="utf-8")
        (self.root / ".gitignore").write_text(".agents/state/\n.agents/reports/\ncalls.log\n__pycache__/\n", encoding="utf-8")

    def deploy_config(self, auto=True, limit=2):
        (self.root / ".agents/deploy.json").write_text(json.dumps(deploy_json(auto, limit), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def entry(self, gate, email, target, sha=None, waiver=None, at=None):
        return {"at": at or approvals.now_text(), "gate": gate, "decision": "approved", "approver": {"email": email, "name": None, "group": None},
                "target": {"name": target, "sha256": sha, "fingerprint": None, "head": None if sha else "abcdef1"}, "phrase": "확인", "path": "terminal",
                "entryId": approvals.new_entry_id(), "ruleCandidate": False, "rollbackWaiver": waiver}

    def append(self, folder, key, entry):
        path = folder / "approvals.md"
        current = path.read_text(encoding="utf-8") if path.is_file() else None
        path.write_text(approvals.appended_text(current, key, entry), encoding="utf-8")

    def make_issue(self, key, name, risk="low", intent=None, design=GOOD_DESIGN, done=True, approver="kim@example.com"):
        """requirements · design 승인 + mr · done 승인이 있는 이슈(병합된 상태는 commit 이 만든다)."""
        folder = self.write_new_issue(f"{key}-{name}", area="payment", req="approved", design="approved")
        extra = {"risk": risk}
        if intent:
            extra["intent"] = intent
        req = folder / "requirements.md"
        req.write_text(update(req.read_text(encoding="utf-8"), extra), encoding="utf-8")
        text = (folder / "design.md").read_text(encoding="utf-8")
        (folder / "design.md").write_text(text.rstrip("\n") + "\n\n" + design, encoding="utf-8")
        sha = approvals.approval_sha((folder / "design.md").read_bytes())
        people = [approver] if risk != "high" else [approver, "lee@example.com"]
        for person in people:
            self.append(folder, key, self.entry("design", person, "design.md", sha))
        if done:
            for person in people:
                self.append(folder, key, self.entry("mr", person, "feat/x"))
            self.append(folder, key, self.entry("done", approver, "feat/x"))
        return folder

    def run_py(self, script, *arguments, env=None):
        return subprocess.run([sys.executable, "-B", str(self.scripts / "harness" / script), *arguments], cwd=self.root, env={**self.env, **(env or {})}, capture_output=True, text=True, timeout=120)

    def calls(self):
        path = self.root / "calls.log"
        return path.read_text(encoding="utf-8").splitlines() if path.is_file() else []

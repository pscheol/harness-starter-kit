"""fixture 리포 sample-repo 를 만든다(설계 11 §3.4): python 스택, 패키지 2개(orders · billing = 도메인 2개), 시험 10개.

파일을 따로 두지 않고 코드로 만드는 이유: 시험 10개가 같은 꼴이라 한 곳에서 보는 편이 낫다.
"""

from __future__ import annotations

from pathlib import Path

DOMAINS = {"orders": "total([1, 2, 3])", "billing": "charge(5)"}
SRC = {
    "orders": '"""주문 도메인."""\n\n\ndef total(items):\n    return sum(items)\n',
    "billing": '"""결제 도메인."""\n\n\ndef charge(amount):\n    return amount\n',
}


def make(root: Path) -> None:
    for domain, call in DOMAINS.items():
        (root / "src" / domain).mkdir(parents=True, exist_ok=True)
        (root / "src" / domain / "__init__.py").write_text(SRC[domain], encoding="utf-8")
        lines = [
            "import sys",
            "import unittest",
            "from pathlib import Path",
            "",
            "sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))",
            f"import {domain}  # noqa: E402",
            "",
            "",
            f"class {domain.title()}Test(unittest.TestCase):",
        ]
        for n in range(1, 6):
            lines += [f"    def test_{n}(self):", f"        self.assertIsNotNone({domain}.{call})", ""]
        (root / "tests").mkdir(exist_ok=True)
        (root / "tests" / f"test_{domain}.py").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (root / "pyproject.toml").write_text('[project]\nname = "sample-orders"\nversion = "0.1.0"\n', encoding="utf-8")

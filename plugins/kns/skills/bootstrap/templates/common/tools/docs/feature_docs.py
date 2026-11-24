#!/usr/bin/env python3
"""기능 문서 생성기·검사기.

    python3 tools/docs/feature_docs.py build            # 원고·스냅숏·소스 → 사이트 폴더(tools/docs/site.json)의 HTML
    python3 tools/docs/feature_docs.py check            # 파일을 쓰지 않고 배정·원고·지문·결과를 검사한다(게이트)
    python3 tools/docs/feature_docs.py check --assets   # 사이트 자산만 — 복사본 = 원본, 외부 스크립트 = 잠금 sha256
    python3 tools/docs/feature_docs.py stats            # 배정 통계와 미배정 항목
    uv run --no-project --with pyyaml python3 tools/docs/feature_docs.py refresh openapi   # OpenAPI 스냅숏 사본 갱신
    python3 tools/docs/feature_docs.py refresh schema   # 빈 Postgres 에 마이그레이션을 적용해 카탈로그를 뜬다(Docker)
    python3 tools/docs/feature_docs.py refresh vendor   # Scalar·Mermaid 를 잠금 파일의 판·integrity 로 받고 파일 sha256 을 잠금에 적는다(네트워크)

build·check·stats 는 표준 라이브러리만 쓰고 DB·서버·네트워크에 붙지 않는다.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True  # 리포에 __pycache__ 를 남기지 않는다 — changed 게이트가 소유 폴더의 .pyc 까지 고른다

from docskit import config as config_module  # noqa: E402
from docskit.refresh import RefreshError, refresh_openapi, refresh_schema, refresh_vendor  # noqa: E402

REPO = HERE.parents[1]


def default_site() -> Path:
    """사이트 폴더는 `tools/docs/site.json` 의 `site`(리포 루트 기준)다. 없으면 `docs/features`."""
    settings = HERE / "site.json"
    if settings.is_file():
        return REPO / json.loads(settings.read_text(encoding="utf-8"))["site"]
    return REPO / "docs" / "features"


SITE = default_site()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--site", type=Path, default=SITE, help="문서 사이트 폴더(기본 tools/docs/site.json 의 site)")
    sub = parser.add_subparsers(dest="command", required=True)
    refresh = sub.add_parser("refresh", help="스냅숏 갱신")
    refresh.add_argument("what", choices=["openapi", "schema", "vendor", "all"])
    sub.add_parser("build", help="HTML 생성")
    check = sub.add_parser("check", help="검사(파일을 쓰지 않는다)")
    check.add_argument("--assets", action="store_true", help="사이트 자산만 본다(복사본 = 원본, 외부 스크립트 = 잠금 sha256)")
    sub.add_parser("stats", help="배정 통계")
    brief = sub.add_parser("brief", help="기능 하나의 생성 사실 요약(원고 작성용)")
    brief.add_argument("feature")
    args = parser.parse_args(argv)
    config = config_module.load(REPO, args.site)

    if args.command == "refresh":
        try:
            written = []
            if args.what in ("openapi", "all"):
                written += refresh_openapi(config)
            if args.what in ("schema", "all"):
                written += refresh_schema(config)
            if args.what == "vendor":
                written += refresh_vendor(config, config.repo / config.vendor_lock)
        except RefreshError as error:
            print(f"✖ {error}", file=sys.stderr)
            return 2
        for path in written:
            print(f"✔ {path.relative_to(REPO)}")
        return 0

    from docskit import site as site_module  # noqa: PLC0415 — refresh 만 쓸 때는 읽지 않는다

    if args.command == "build":
        written = site_module.build(config)
        print(f"✔ {len(written)} 파일")
        return 0
    if args.command == "check":
        problems = site_module.check_assets(config) if args.assets else site_module.check(config)
        scope = "사이트 자산 검사" if args.assets else "기능 문서 검사"
        warning = site_module.vendor_warning(config)
        if warning:
            print(f"⚠ {warning}")
        for problem in problems:
            print(f"✖ {problem}")
        if problems:
            print(f"✖ {scope} 실패 {len(problems)}건 — 고친 뒤 python3 tools/docs/feature_docs.py build")
            return 1
        print(f"✔ {scope} 통과")
        return 0
    if args.command == "stats":
        print(site_module.stats(config))
        return 0
    if args.command == "brief":
        print(site_module.brief(config, args.feature))
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())

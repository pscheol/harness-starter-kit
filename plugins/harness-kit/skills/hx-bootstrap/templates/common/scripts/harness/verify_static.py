"""문서·설정의 변경 파일에 문법·링크·코드 펜스 검사를 적용한다."""

import argparse
import json
import re
import sys
import tomllib
from pathlib import Path
from urllib.parse import unquote


def markdown_errors(path, root, text):
    errors, fenced, delimiter = [], False, ""
    outside_fences = []
    for line in text.splitlines():
        match = re.match(r"^\s*(`{3,}|~{3,})", line)
        if match:
            token = match.group(1)
            if not fenced:
                fenced, delimiter = True, token
            elif token[0] == delimiter[0] and len(token) >= len(delimiter):
                fenced = False
        elif not fenced:
            outside_fences.append(line)
    if fenced:
        errors.append("unclosed code fence")
    for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", "\n".join(outside_fences)):
        link = target.split(' "', 1)[0].strip("<>").split("#", 1)[0]
        if not link or re.match(r"[A-Za-z][A-Za-z0-9+.-]*:", link):
            continue
        linked = (path.parent / unquote(link)).resolve()
        if not linked.is_relative_to(root):
            errors.append(f"link outside harness: {target}")
        elif not linked.exists():
            errors.append(f"broken link: {target}")
    return errors


PARSED_SUFFIXES = {".json", ".toml", ".md"}


def content_errors(path, root, text):
    if path.suffix == ".json":
        json.loads(text)
        return []
    if path.suffix == ".toml":
        tomllib.loads(text)
        return []
    return markdown_errors(path, root, text)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("files", nargs="+")
    options = parser.parse_args()
    errors, skipped = [], []
    for relative in options.files:
        path = options.root / relative
        if not path.is_file():
            skipped.append(f"{relative}: deleted file has no content to parse")
            continue
        if path.suffix not in PARSED_SUFFIXES:
            # 이미지·폰트 같은 바이너리도 여기로 온다. 글로 읽으면 디코딩 오류가 검사 실패로 보고된다.
            skipped.append(f"{relative}: no built-in syntax parser; L0 content validation skipped")
            continue
        try:
            text = path.read_text(encoding="utf-8")
            errors.extend(f"{relative}: {error}" for error in content_errors(path, options.root, text))
        except (ValueError, OSError) as error:
            errors.append(f"{relative}: {error}")
    print(json.dumps({"level": "L0", "errors": errors, "skipped": skipped}, ensure_ascii=False))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())

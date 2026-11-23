#!/usr/bin/env python3
"""지정한 운영 코드 파일의 이름·조건식 개선 후보를 경고한다. 코드를 수정하지 않는다."""

import argparse
import ast
import json
import re
import sys
from pathlib import Path

AMBIGUOUS_BINDINGS = frozenset({"list", "instance", "req", "resp", "r", "s"})
SOURCE_SUFFIXES = frozenset({".py", ".kt", ".kts", ".ts", ".tsx", ".js", ".jsx"})
SKIPPED_DIRECTORIES = frozenset(
    {
        "docs",
        "test",
        "tests",
        "__tests__",
        "fixture",
        "fixtures",
        "examples",
        "generated",
        "__generated__",
        "node_modules",
        "build",
        "dist",
        "target",
        ".git",
    }
)
SKIPPED_NAME = re.compile(
    r"^(?:test_|conftest\.py$)|[._](?:test|spec)\.|(?:Test|Tests|IT)\.(?:kt|kts)$"
    r"|(?:[._]generated|\.d)\.(?:ts|tsx|js|jsx)$"
)
MASKED_TEXT = re.compile(
    r'//[^\n]*|/\*[\s\S]*?\*/|"""[\s\S]*?"""'
    r'|"(?:\\[\s\S]|[^"\\])*"|\'(?:\\[\s\S]|[^\'\\])*\''
    r"|`(?:\\[\s\S]|[^`\\])*`"
)
BINDING = re.compile(r"\b(?:val|var|const|let)\s+(list|instance|req|resp|r|s)\b\s*(?::[^=;\n]+)?=")
CONDITION = re.compile(r"\b(?:if|while)\s*\(")
REVIEW_REQUIRED = "정확한 의미 판정은 리뷰에서 한다. 경고는 개선 후보이며 자동 변경·기존 위반 차단에 쓰지 않는다."


def diagnostic(path, line, column, code, message):
    actions = {
        "CM001": "업무 의미가 있는 named predicate로 분리할지 리뷰한다. 단락 평가·호출 순서·부작용을 보존하고 경계값과 진리표를 테스트한다.",
        "CM002": "담긴 도메인 개념·역할이 드러나는 이름으로 바꿀지 리뷰한다. 외부 계약명·표준 기술 용어는 보존한다.",
        "CM003": "파일 인코딩·문법과 해당 언어 검사기를 확인한다. 이번 진단으로 코드의 의미를 판정할 수 없다.",
    }
    return {
        "path": path,
        "line": line,
        "column": column,
        "code": code,
        "severity": "warning",
        "message": message,
        "action": actions[code],
    }


def selected_files(root, selections):
    paths = []
    labels = set()
    for selection in selections:
        relative = Path(selection)
        if not selection or relative.is_absolute() or ".." in relative.parts:
            raise ValueError("--files requires an existing relative file without parent traversal")
        label = relative.as_posix()
        candidate = root / relative
        if not candidate.resolve().is_relative_to(root):
            raise ValueError("--files selection resolves outside the current root")
        if not candidate.is_file():
            raise ValueError("--files requires an existing relative file; directories and missing files are not scanned")
        if label not in labels:
            paths.append((label, candidate))
            labels.add(label)
    return paths


def skip_reason(label):
    relative = Path(label)
    if SKIPPED_DIRECTORIES.intersection(relative.parts) or SKIPPED_NAME.search(relative.name):
        return "문서·테스트·fixture·생성물은 진단 대상에서 제외"
    if relative.suffix not in SOURCE_SUFFIXES:
        return "지원하는 운영 코드 확장자가 아님"
    return None


def boolean_operators(expression):
    if isinstance(expression, ast.BoolOp):
        return {type(expression.op)}.union(*(boolean_operators(value) for value in expression.values))
    if isinstance(expression, ast.UnaryOp) and isinstance(expression.op, ast.Not):
        return boolean_operators(expression.operand)
    return set()


def function_nodes(function):
    pending = list(function.body)
    while pending:
        node = pending.pop()
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue
        yield node
        pending.extend(ast.iter_child_nodes(node))


def assigned_names(target):
    if isinstance(target, ast.Name):
        return [target]
    if isinstance(target, (ast.Tuple, ast.List)):
        return [name for element in target.elts for name in assigned_names(element)]
    if isinstance(target, ast.Starred):
        return assigned_names(target.value)
    return []


def binding_targets(node):
    if isinstance(node, ast.Assign):
        return node.targets
    if isinstance(node, (ast.AnnAssign, ast.AugAssign, ast.NamedExpr, ast.For, ast.AsyncFor, ast.comprehension)):
        return [node.target]
    if isinstance(node, ast.withitem) and node.optional_vars is not None:
        return [node.optional_vars]
    return []


def python_binding_diagnostics(label, tree):
    warnings = []
    for function in ast.walk(tree):
        if not isinstance(function, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        parameters = function.args.posonlyargs + function.args.args + function.args.kwonlyargs
        parameters += [argument for argument in (function.args.vararg, function.args.kwarg) if argument]
        excluded = {argument.arg for argument in parameters}
        nodes = tuple(function_nodes(function))
        excluded.update(name for node in nodes if isinstance(node, (ast.Global, ast.Nonlocal)) for name in node.names)
        for node in nodes:
            for target in binding_targets(node):
                for name in assigned_names(target):
                    if name.id in AMBIGUOUS_BINDINGS and name.id not in excluded:
                        warnings.append(
                            diagnostic(
                                label,
                                name.lineno,
                                name.col_offset + 1,
                                "CM002",
                                f"지역 이름 '{name.id}'만으로 대상·역할을 알기 어렵다",
                            )
                        )
    return warnings


def python_diagnostics(label, source):
    try:
        tree = ast.parse(source)
    except (SyntaxError, ValueError) as error:
        return [
            diagnostic(
                label,
                getattr(error, "lineno", None) or 1,
                getattr(error, "offset", None) or 1,
                "CM003",
                "Python AST 분석 실패",
            )
        ]
    warnings = python_binding_diagnostics(label, tree)
    for node in ast.walk(tree):
        condition = node.test if isinstance(node, (ast.If, ast.While, ast.IfExp)) else None
        if isinstance(node, ast.match_case):
            condition = node.guard
        if condition is not None and len(boolean_operators(condition)) > 1:
            warnings.append(
                diagnostic(
                    label,
                    condition.lineno,
                    condition.col_offset + 1,
                    "CM001",
                    "한 조건식에 and/or가 함께 있어 판단의 의미를 읽기 어렵다",
                )
            )
    return warnings


def line_column(source, offset):
    return source.count("\n", 0, offset) + 1, offset - source.rfind("\n", 0, offset)


def parenthesized_body(source, opening):
    depth = 0
    for offset in range(opening, len(source)):
        character = source[offset]
        depth += (character == "(") - (character == ")")
        if depth == 0:
            return source[opening + 1 : offset]
    return ""


def bracket_language_diagnostics(label, source):
    masked = MASKED_TEXT.sub(lambda match: re.sub(r"[^\n]", " ", match.group()), source)
    warnings = []
    for binding in BINDING.finditer(masked):
        line, column = line_column(source, binding.start(1))
        warnings.append(diagnostic(label, line, column, "CM002", f"이름 '{binding.group(1)}'의 대상·역할을 리뷰한다(문자열 기반 후보)"))
    for condition in CONDITION.finditer(masked):
        body = parenthesized_body(masked, condition.end() - 1)
        if "&&" in body and "||" in body:
            line, column = line_column(source, condition.start())
            warnings.append(diagnostic(label, line, column, "CM001", "한 조건식의 &&/|| 혼합을 리뷰한다(문자열 기반 후보)"))
    return warnings


def check_selected(paths):
    checked, skipped, warnings = [], [], []
    for label, path in paths:
        reason = skip_reason(label)
        if reason:
            skipped.append({"path": label, "reason": reason})
            continue
        checked.append(label)
        try:
            source = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            warnings.append(diagnostic(label, 1, 1, "CM003", "운영 코드 읽기 실패"))
            continue
        checker = python_diagnostics if path.suffix == ".py" else bracket_language_diagnostics
        warnings.extend(checker(label, source))
    unique = {(warning["path"], warning["line"], warning["column"], warning["code"]): warning for warning in warnings}
    return {
        "checked": checked,
        "diagnostics": [unique[key] for key in sorted(unique)],
        "skipped": skipped,
        "reviewRequired": REVIEW_REQUIRED,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--files",
        nargs="+",
        required=True,
        help="현재 하네스에서 선택한 상대 파일 경로. 디렉터리·전체 탐색은 지원하지 않는다",
    )
    parser.add_argument("--json", action="store_true", help="검사 파일·경고·제외 사유를 JSON으로 출력한다")
    arguments = parser.parse_args()
    try:
        paths = selected_files(Path.cwd().resolve(), arguments.files)
    except (OSError, ValueError) as error:
        parser.error(str(error))
    report = check_selected(paths)
    if arguments.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        for warning in report["diagnostics"]:
            print(f"{warning['path']}:{warning['line']}:{warning['column']}: warning {warning['code']}: {warning['message']}")
            print(f"  action: {warning['action']}")
        print(f"checked: {len(report['checked'])}; warnings: {len(report['diagnostics'])}; skipped: {len(report['skipped'])}")
        print(REVIEW_REQUIRED)
    return 0


if __name__ == "__main__":
    sys.exit(main())

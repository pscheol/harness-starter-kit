"""FastAPI 라우터를 `ast` 로 읽는다. 앱을 띄우지 않는다(설정·모델 적재가 필요하다)."""

from __future__ import annotations

import ast
from dataclasses import dataclass
from pathlib import Path

VERBS = {"get": "GET", "post": "POST", "put": "PUT", "patch": "PATCH", "delete": "DELETE", "websocket": "WS"}


@dataclass
class PyEndpoint:
    unit: str
    method: str
    path: str
    module: str
    function: str
    file: str
    line: int
    summary: str


def _const_str(node: ast.AST | None) -> str | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def _router_prefixes(tree: ast.Module) -> dict[str, str]:
    prefixes: dict[str, str] = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
            func = node.value.func
            name = func.id if isinstance(func, ast.Name) else func.attr if isinstance(func, ast.Attribute) else ""
            if name in ("APIRouter", "FastAPI"):
                prefix = next((_const_str(k.value) for k in node.value.keywords if k.arg == "prefix"), "") or ""
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        prefixes[target.id] = prefix
    return prefixes


def endpoints(unit: str, root: Path, sources: list[str], repo: Path) -> list[PyEndpoint]:
    found: list[PyEndpoint] = []
    for base in sources:
        for path in sorted((root / base).rglob("*.py")):
            if "__pycache__" in path.parts:
                continue
            try:
                tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            except SyntaxError:
                continue
            prefixes = _router_prefixes(tree)
            module = ".".join(path.relative_to(root / base).with_suffix("").parts)
            for node in ast.walk(tree):
                if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    continue
                for deco in node.decorator_list:
                    if not (isinstance(deco, ast.Call) and isinstance(deco.func, ast.Attribute)):
                        continue
                    owner = deco.func.value.id if isinstance(deco.func.value, ast.Name) else ""
                    verb = deco.func.attr
                    methods: list[str] = []
                    if verb in VERBS:
                        methods = [VERBS[verb]]
                    elif verb == "api_route":
                        kw = next((k.value for k in deco.keywords if k.arg == "methods"), None)
                        if isinstance(kw, (ast.List, ast.Tuple)):
                            methods = [str(_const_str(e)).upper() for e in kw.elts if _const_str(e)]
                    if not methods or owner not in prefixes and owner not in ("router", "app"):
                        continue
                    hidden = next((k.value for k in deco.keywords if k.arg == "include_in_schema"), None)
                    if isinstance(hidden, ast.Constant) and hidden.value is False:
                        continue  # 문서 화면(/scalar 등)처럼 API 명세에 싣지 않는 경로
                    sub = _const_str(deco.args[0]) if deco.args else next((_const_str(k.value) for k in deco.keywords if k.arg == "path"), "")
                    doc = ast.get_docstring(node) or ""
                    for method in methods:
                        found.append(
                            PyEndpoint(
                                unit=unit,
                                method=method,
                                path=(prefixes.get(owner, "") + (sub or "")) or "/",
                                module=module,
                                function=node.name,
                                file=path.relative_to(repo).as_posix(),
                                line=node.lineno,
                                summary=doc.strip().splitlines()[0] if doc.strip() else "",
                            )
                        )
    found.sort(key=lambda e: (e.path, e.method))
    return found

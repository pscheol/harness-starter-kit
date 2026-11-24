"""검증 경로와 하네스 소유 단위를 확인한다."""

import json
import os
from pathlib import Path

IGNORED_DIRECTORIES = {
    ".git",
    "node_modules",
    ".next",
    ".gradle",
    ".kotlin",
    "build",
    "dist",
    "out",
    "coverage",
    "__pycache__",
    ".pytest_cache",
    ".ruff_cache",
    ".dart_tool",
    "Pods",
    "models",
    "ref",
    ".idea",
}
CODE_EXTENSIONS = {
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".kt",
    ".kts",
    ".gradle",
    ".java",
    ".dart",
    ".sh",
    ".go",
}


def safe_file(root, relative, must_exist=False):
    if not isinstance(relative, str) or not relative or "\x00" in relative:
        raise ValueError("file path must be a nonempty string")
    path = Path(relative)
    if path.is_absolute() or ".." in path.parts or ".git" in path.parts:
        raise ValueError(f"file path is outside the harness: {relative}")
    absolute = (root / path).resolve()
    if not absolute.is_relative_to(root):
        raise ValueError(f"file symlink is outside the harness: {relative}")
    if absolute.is_dir() or (must_exist and not absolute.is_file()):
        raise ValueError(f"expected an individual existing file: {relative}")
    return absolute


def project_files(root, extensions=None):
    for directory, folders, names in os.walk(root, followlinks=False):
        folders[:] = sorted(
            folder
            for folder in folders
            if folder not in IGNORED_DIRECTORIES and not folder.startswith((".venv", ".next-")) and not (Path(directory) / folder).is_symlink()
        )
        for name in sorted(names):
            path = Path(directory) / name
            if (extensions is None or path.suffix in extensions) and path.resolve().is_relative_to(root):
                yield path


def units_for(root):
    manifest = json.loads((root / ".agents/harness.json").read_text())
    units = [
        {
            "id": manifest["unit"],
            "root": root,
            "stack": manifest.get("stack", "unknown"),
        }
    ]
    registry = root / "tools/harness/units.json"
    if registry.is_file():
        for unit in json.loads(registry.read_text())["units"]:
            if unit["path"] == ".":
                continue
            marker = safe_file(root, unit["path"] + "/.agents/harness.json")
            if marker.is_file():
                units.append(
                    {
                        "id": unit["id"],
                        "root": marker.parent.parent,
                        "stack": unit["stack"],
                    }
                )
    else:
        for marker in project_files(root, {".json"}):
            if marker.name == "harness.json" and marker.parent.name == ".agents" and marker.parent.parent != root:
                data = json.loads(marker.read_text())
                units.append(
                    {
                        "id": data["unit"],
                        "root": marker.parent.parent,
                        "stack": data.get("stack", "unknown"),
                    }
                )
    return sorted(units, key=lambda unit: len(unit["root"].parts), reverse=True)


def owner_for(path, units):
    return next(unit for unit in units if path.is_relative_to(unit["root"]))


def project_for(path, unit_root):
    test_root = None
    for directory in (path.parent, *path.parents):
        if not directory.is_relative_to(unit_root):
            break
        if any((directory / name).is_file() for name in ("pyproject.toml", "package.json", "pubspec.yaml")):
            return directory
        if test_root is None and (directory / "tests").is_dir():
            test_root = directory
    return test_root or unit_root


def uv_workspace_root(project, unit_root):
    """project 가 uv workspace 하위 프로젝트면 workspace 상위 폴더, 아니면 None. 상위는 단위 뿌리를 넘지 않는다."""
    import tomllib

    for directory in project.parents:
        if not directory.is_relative_to(unit_root):
            return None
        manifest = directory / "pyproject.toml"
        if not manifest.is_file():
            continue
        try:
            members = tomllib.loads(manifest.read_text()).get("tool", {}).get("uv", {}).get("workspace", {}).get("members", [])
        except (tomllib.TOMLDecodeError, OSError):
            return None
        if any(project.resolve() == member.resolve() for pattern in members for member in directory.glob(pattern)):
            return directory
        return None
    return None


def is_test(path):
    return path.suffix in CODE_EXTENSIONS and (
        path.name.startswith("test_") or path.stem.endswith(("_test", "Test", "Tests", "Spec", "IT")) or ".test." in path.name or ".spec." in path.name
    )

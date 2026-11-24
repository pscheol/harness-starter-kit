"""검증 가능한 파일 이름과 import 관계로 영향 테스트를 선택한다."""

import ast
import re
from pathlib import Path

from harness.verify_paths import is_test, project_files

SCRIPT_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
MAIN_GUARD = re.compile(r"__name__\s*==\s*[\"']__main__[\"']")


def source_text(path):
    return path.read_text(errors="replace") if path.is_file() else ""


def workspace_members(project):
    """project 가 uv workspace 상위면 하위 폴더 이름들. 하위의 모듈 이름은 그 하위 폴더를 뗀 경로로 센다."""
    import tomllib

    manifest = project / "pyproject.toml"
    try:
        members = tomllib.loads(manifest.read_text()).get("tool", {}).get("uv", {}).get("workspace", {}).get("members", []) if manifest.is_file() else []
    except (tomllib.TOMLDecodeError, OSError):
        return frozenset()
    return frozenset(member.name for pattern in members for member in project.glob(pattern) if member.is_dir())


def python_module(path, project):
    parts = list(path.relative_to(project).with_suffix("").parts)
    if len(parts) > 1 and parts[0] in workspace_members(project):
        parts = parts[1:]
    if parts[0] == "src":
        parts = parts[1:]
    if parts[-1] == "__init__":
        parts = parts[:-1]
    return ".".join(parts)


def python_imports(path, project, text=None):
    try:
        tree = ast.parse(source_text(path) if text is None else text)
    except SyntaxError:
        return set()
    imports = set()
    module_parts = python_module(path, project).split(".")
    package = module_parts if path.stem == "__init__" else module_parts[:-1]
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            prefix = package[: len(package) - node.level + 1] if node.level else []
            module = ".".join([*prefix, *([node.module] if node.module else [])])
            imports.add(module)
            imports.update(module + "." + alias.name for alias in node.names)
    return imports


def consumer_closure(sources, dependency_reader, selected):
    affected = set(selected)
    while True:
        consumers = {source for source in sources if dependency_reader(source).intersection(affected)}
        expanded = affected | consumers
        if expanded == affected:
            return affected
        affected = expanded


def python_names(path, project):
    """import 에 쓰이는 모듈 이름. tests/ 아래 도우미는 tests 폴더를 경로에 넣은 이름(support.x)으로도 불린다."""
    module = python_module(path, project)
    parts = module.split(".")
    return {module, ".".join(parts[1:])} if parts[0] == "tests" and len(parts) > 1 else {module}


def is_runnable_script(path, text):
    return path.suffix == ".sh" or text.startswith("#!") or bool(MAIN_GUARD.search(text))


def file_name_pattern(paths, texts, quoted):
    """하위 프로세스로 실행하는 스크립트는 import 대신 파일 이름으로 참조된다.

    일반 모듈은 docstring 에 이름이 자주 나와 연결이 지나치게 넓어지므로 실행 스크립트(shebang·__main__)만 본다.
    quoted 면 이름 바로 뒤에 따옴표가 오는 코드 문자열만 참조로 본다(설명 문장 속 언급 제외).
    """
    names = sorted({path.name for path in paths if is_runnable_script(path, texts.get(path) or source_text(path))})
    if not names:
        return None
    return re.compile(r"(?<![\w-])(?:" + "|".join(re.escape(name) for name in names) + ")" + ("[\"']" if quoted else ""))


def python_tests(source, project):
    files = list(project_files(project, {".py"}))
    sources = [path for path in files if not is_test(path)]
    texts = {path: source_text(path) for path in files}
    imports = {path: python_imports(path, project, texts[path]) for path in files}
    package = python_module(source, project) + "." if source.name == "__init__.py" else None

    def refers(path, modules, pattern):
        if imports[path] & modules or (pattern and pattern.search(texts[path])):
            return True
        return bool(package) and any(name.startswith(package) for name in imports[path])

    affected = {source}
    while True:
        modules = set().union(*(python_names(path, project) for path in affected))
        quoted = file_name_pattern(affected, texts, quoted=True)
        consumers = {path for path in sources if path not in affected and refers(path, modules, quoted)}
        if not consumers:
            break
        affected |= consumers
    mentioned = file_name_pattern(affected, texts, quoted=False)
    stems = {path.stem.replace("-", "_") for path in affected}
    named = {"test_" + stem for stem in stems} | {stem + "_test" for stem in stems}
    return {path for path in files if is_test(path) and (path.stem in named or refers(path, modules, mentioned))}


def script_imports(path, project):
    imports = re.findall(
        r"(?:from\s*|import\s*\(|require\s*\(|import\s*)[\"']([^\"']+)[\"']",
        source_text(path),
    )
    dependencies = set()
    for name in imports:
        if name.startswith("."):
            candidate = path.parent / name
        elif name.startswith(("@/", "~/")):
            candidate = project / "src" / name[2:]
        else:
            continue
        candidate = candidate.resolve()
        alternatives = [candidate.with_suffix(extension) for extension in (".ts", ".tsx")] if candidate.suffix == ".js" else []
        for dependency in [
            candidate,
            *alternatives,
            *(Path(str(candidate) + extension) for extension in SCRIPT_EXTENSIONS),
            *(candidate / ("index" + extension) for extension in SCRIPT_EXTENSIONS),
        ]:
            if dependency.is_file() and dependency.is_relative_to(project):
                dependencies.add(dependency)
    return dependencies


def script_tests(source, project):
    files = list(project_files(project, SCRIPT_EXTENSIONS))
    dependencies = {path: script_imports(path, project) for path in files}
    affected = consumer_closure(
        [path for path in files if not is_test(path)],
        lambda path: dependencies[path],
        {source},
    )
    stems = {path.stem for path in affected}
    return {
        path
        for path in files
        if is_test(path) and (path.stem in {stem + ".test" for stem in stems} | {stem + ".spec" for stem in stems} or dependencies[path].intersection(affected))
    }


def jvm_package(path):
    match = re.search(r"(?m)^\s*package\s+([A-Za-z_][\w.]*)", source_text(path))
    return match.group(1) if match else ""


def jvm_names(path):
    names = re.findall(r"\b(?:class|interface|object|typealias)\s+([A-Za-z_]\w*)", source_text(path))
    return set(names) or {path.stem}


def jvm_module(source, project):
    for parent in source.parents:
        if not parent.is_relative_to(project):
            break
        if any((parent / name).is_file() for name in ("build.gradle.kts", "build.gradle")):
            return parent
    return None


def jvm_references(candidate, target):
    names = jvm_names(target)
    text = source_text(candidate)
    if jvm_package(candidate) == jvm_package(target):
        return any(re.search(r"\b" + re.escape(name) + r"\b", text) for name in names)
    package = jvm_package(target)
    return any(re.search(r"\bimport\s+" + re.escape(package + "." + name) + r"\b", text) for name in names)


def test_support_closure(files, affected):
    """테스트 폴더의 지원 파일(조립용 world·MockMvc 등)이 바뀐 소스를 만들면, 그 파일을 쓰는 테스트도 영향을 받는다."""
    supports = [path for path in files if "/src/test/" in path.as_posix() and not is_test(path)]
    found, pending = set(), set(affected)
    while pending:
        pending = {path for path in supports if path not in found and any(jvm_references(path, target) for target in pending)}
        found |= pending
    return found


def jvm_tests(source, project):
    module = jvm_module(source, project)
    if module is None:
        return set()
    files = list(project_files(module, {".kt", ".java"}))
    sources = [path for path in files if "/src/main/" in path.as_posix()]
    symbols = {(jvm_package(path), name): path for path in [*sources, source] for name in jvm_names(path)}
    qualified = {package + "." + name: path for (package, name), path in symbols.items()}
    dependencies = {}
    for path in sources:
        text = source_text(path)
        identifiers = set(re.findall(r"\b[A-Za-z_]\w*\b", text))
        package = jvm_package(path)
        local = {symbols[(package, name)] for name in identifiers if (package, name) in symbols}
        imported = {qualified[name] for name in re.findall(r"\bimport\s+([\w.]+)", text) if name in qualified}
        dependencies[path] = (local | imported) - {path}
    affected = consumer_closure(sources, lambda path: dependencies[path], {source})
    affected |= test_support_closure(files, affected)
    return {
        path
        for path in files
        if "/src/test/" in path.as_posix()
        and is_test(path)
        and any(jvm_references(path, target) or path.stem in {name + "Test" for name in jvm_names(target)} for target in affected)
    }


def jvm_test_names(test):
    names = re.findall(
        r"(?<!abstract )\bclass\s+([A-Za-z_]\w*(?:Test|Tests|Spec|IT))\b",
        source_text(test),
    )
    package = jvm_package(test)
    return [package + "." + name if package else name for name in names]


def dart_tests(source, project):
    files = list(project_files(project, {".dart"}))
    manifest = project / "pubspec.yaml"
    name = re.search(r"(?m)^name:\s*['\"]?([a-z][a-z0-9_]*)", source_text(manifest))
    package_prefix = "package:" + name.group(1) + "/" if name else ""
    dependencies = {}
    for path in files:
        imports = re.findall(r"\b(?:import|export|part)\s+[\"']([^\"']+)[\"']", source_text(path))
        local = {(path.parent / imported).resolve() for imported in imports if ":" not in imported}
        packaged = {
            (project / "lib" / imported[len(package_prefix) :]).resolve() for imported in imports if package_prefix and imported.startswith(package_prefix)
        }
        dependencies[path] = local | packaged
    affected = consumer_closure(
        [path for path in files if not is_test(path)],
        lambda path: dependencies[path],
        {source},
    )
    return {path for path in files if is_test(path) and (path.stem == source.stem + "_test" or dependencies[path].intersection(affected))}


def related_tests(source, project):
    if is_test(source) and source.is_file():
        return {source}
    if source.suffix in {".py", ".sh"}:
        return python_tests(source, project)
    if source.suffix in SCRIPT_EXTENSIONS:
        return script_tests(source, project)
    if source.suffix in {".kt", ".java"}:
        return jvm_tests(source, project)
    if source.suffix == ".dart":
        return dart_tests(source, project)
    if source.suffix == ".go":
        return set(source.parent.glob("*_test.go")) if source.parent.is_dir() else set()
    return set()

"""스냅숏 갱신. 생성·검사와 달리 PyYAML(YAML OpenAPI)과 Docker(DB 카탈로그)를 쓴다. 명시적으로만 돈다."""

from __future__ import annotations

import base64
import hashlib
import io
import json
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request
from pathlib import Path

from . import fingerprint
from .config import Config
from .extract import schema as schema_extract


class RefreshError(RuntimeError):
    pass


YAML_HINT = "YAML 스냅숏을 읽으려면 PyYAML 이 필요하다: uv run --no-project --with pyyaml python3 tools/docs/feature_docs.py refresh openapi"


def dump(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False, sort_keys=True, indent=1) + "\n"


def _load_yaml(text: str) -> dict:
    try:
        import yaml  # type: ignore[import-untyped]
    except ImportError as error:
        raise RefreshError(YAML_HINT) from error

    class Loader(yaml.SafeLoader):
        """날짜처럼 보이는 예시 값을 문자열 그대로 둔다(원본 YAML 의 글자와 같게)."""

    Loader.yaml_implicit_resolvers = {
        key: [(tag, regex) for tag, regex in resolvers if tag != "tag:yaml.org,2002:timestamp"]
        for key, resolvers in yaml.SafeLoader.yaml_implicit_resolvers.items()
    }
    return yaml.load(text, Loader=Loader)  # noqa: S506 — SafeLoader 하위 클래스


def openapi_target(config: Config, unit_id: str, name: str) -> Path:
    return config.data / "openapi" / f"{unit_id}--{name}.json"


def refresh_openapi(config: Config) -> list[Path]:
    written: list[Path] = []
    for unit in config.units:
        for source in unit.openapi:
            path = config.repo / source.source
            if not path.is_file():
                raise RefreshError(f"OpenAPI 원본이 없다: {source.source}")
            text = path.read_text(encoding="utf-8")
            spec = json.loads(text) if path.suffix == ".json" else _load_yaml(text)
            spec["x-docs-source"] = {"path": source.source, "sha256": fingerprint.file_sha256(path)}
            target = openapi_target(config, unit.id, source.name)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(dump(spec), encoding="utf-8")
            written.append(target)
    return written


def schema_target(config: Config, database_id: str) -> Path:
    return config.data / "schema" / f"{database_id}.json"


def refresh_schema(config: Config) -> list[Path]:
    written: list[Path] = []
    for database in config.databases:
        with tempfile.TemporaryDirectory(prefix="feature-docs-schema-") as tmp:
            out = Path(tmp) / "catalog.json"
            command = [
                "bash",
                str(config.repo / config.fingerprint_script),
                database.target,
                str(Path(tmp) / "fingerprint.txt"),
                "--migrations",
                str(config.repo / database.migrations[0]),
                "--catalog-sql",
                str(config.repo / config.catalog_sql),
                "--catalog-out",
                str(out),
            ]
            for extra in database.migrations[1:2]:
                command += ["--extra-migrations", str(config.repo / extra)]
            if len(database.migrations) > 2:
                raise RefreshError(f"{database.id}: 마이그레이션 디렉터리는 둘까지다")
            completed = subprocess.run(command, cwd=config.repo, capture_output=True, text=True)
            if completed.returncode != 0:
                raise RefreshError(f"{database.id} 카탈로그 실패:\n{completed.stdout[-2000:]}\n{completed.stderr[-2000:]}")
            raw = json.loads(out.read_text(encoding="utf-8"))
        data = schema_extract.normalize(raw, database.id, fingerprint.migration_sources(config.repo, database.migrations))
        target = schema_target(config, database.id)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(dump(data), encoding="utf-8")
        written.append(target)
    return written


def _download(url: str) -> bytes:
    """시스템 curl 이 있으면 그것으로 받는다(python.org macOS 판은 CA 묶음이 없다). 어느 쪽이든 호출부가 integrity 를 확인한다."""
    if shutil.which("curl"):
        completed = subprocess.run(["curl", "-fsSL", "--max-time", "120", url], capture_output=True)
        if completed.returncode != 0:
            raise RefreshError(f"받기 실패: {url}: {completed.stderr.decode(errors='replace').strip()}")
        return completed.stdout
    with urllib.request.urlopen(url, timeout=120) as response:  # noqa: S310 — 잠금 파일의 고정 주소
        return response.read()


def refresh_vendor(config: Config, lock: Path) -> list[Path]:
    """잠금 파일의 판·integrity 로 외부 스크립트를 받는다. 모든 패키지를 받아 integrity 와 파일을 확인한 뒤에만 쓴다 —
    하나라도 틀리면 아무것도 쓰지 않는다(사이트 파일도 잠금 파일도). 쓴 파일의 sha256 을 잠금에 남겨 check 가 오프라인으로 대조한다."""
    spec = json.loads(lock.read_text(encoding="utf-8"))
    vendor = config.site / "assets" / "vendor"
    extracted: list[tuple[dict, str, bytes]] = []
    for package in spec["packages"]:
        data = _download(package["tarball"])
        algorithm, expected = package["integrity"].split("-", 1)
        actual = base64.b64encode(hashlib.new(algorithm, data).digest()).decode()
        if actual != expected:
            raise RefreshError(f"{package['name']}@{package['version']} integrity 불일치 — 아무것도 쓰지 않았다")
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
            for member, target in package["files"].items():
                found = archive.extractfile(member)
                if found is None:
                    raise RefreshError(f"{package['name']}: {member} 없음 — 아무것도 쓰지 않았다")
                extracted.append((package, target, found.read()))

    written: list[Path] = []
    readme = ["# vendor", "", "문서 사이트가 인터넷 없이 그리려고 들인 외부 스크립트다. `python3 tools/docs/feature_docs.py refresh vendor` 가 만든다.", ""]
    readme += ["| 패키지 | 판 | 라이선스 | 파일 | sha256 |", "|---|---|---|---|---|"]
    for package in spec["packages"]:
        package["sha256"] = {}
    for package, target, content in extracted:
        path = vendor / target
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        written.append(path)
        digest = hashlib.sha256(content).hexdigest()
        package["sha256"][target] = digest
        readme.append(f"| {package['name']} | {package['version']} | {package['license']} | `{target}` | `{digest[:16]}…` |")
    (vendor / "README.md").write_text("\n".join(readme) + "\n", encoding="utf-8")
    written.append(vendor / "README.md")
    lock.write_text(json.dumps(spec, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return written

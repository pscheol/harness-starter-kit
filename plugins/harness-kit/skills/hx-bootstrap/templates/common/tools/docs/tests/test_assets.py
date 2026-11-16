"""사이트 자산 검사(`check --assets`)와 외부 스크립트 잠금의 파일 sha256.

생성물·리포에 둔 외부 라이브러리는 파일마다 시험이 없다. 이 검사가 그 파일들을 책임진다.
"""

import base64
import hashlib
import io
import json
import shutil
import tarfile
import unittest
from unittest import mock

from docskit import refresh, site
from tests.test_check import fixture_site

STUB = b"/* stub */"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class AssetsCheckTest(unittest.TestCase):
    def setUp(self):
        self.tmp, self.site, self.config = fixture_site()
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.lock = self.tmp / "tools" / "docs" / "vendor.lock.json"

    def write_lock(self, packages):
        self.lock.parent.mkdir(parents=True, exist_ok=True)
        self.lock.write_text(json.dumps({"packages": packages}), encoding="utf-8")

    def package(self, files, digests):
        return {"name": "x", "version": "1.0.0", "license": "MIT", "tarball": "", "integrity": "sha512-AAAA", "files": files, "sha256": digests}

    def test_clean_build_has_no_asset_problems(self):
        self.assertEqual(site.check_assets(self.config), [])

    def test_copied_asset_that_differs_from_source_is_reported(self):
        (self.site / "assets" / "site.js").write_text("// 손으로 고침\n", encoding="utf-8")
        self.assertIn("assets/site.js", "\n".join(site.check_assets(self.config)))
        self.assertIn("assets/site.js", "\n".join(site.check(self.config)))

    def test_vendor_files_matching_the_lock_pass(self):
        self.write_lock(
            [
                self.package({"package/a.js": "mermaid/mermaid.min.js"}, {"mermaid/mermaid.min.js": sha256(STUB)}),
                self.package({"package/b.js": "scalar/standalone.js"}, {"scalar/standalone.js": sha256(STUB)}),
            ]
        )
        self.assertEqual(site.check_assets(self.config), [])

    def test_vendor_file_that_differs_from_the_lock_is_reported(self):
        self.write_lock(
            [
                self.package({"package/a.js": "mermaid/mermaid.min.js"}, {"mermaid/mermaid.min.js": sha256(b"other")}),
                self.package({"package/b.js": "scalar/standalone.js"}, {"scalar/standalone.js": sha256(STUB)}),
            ]
        )
        found = "\n".join(site.check_assets(self.config))
        self.assertIn("assets/vendor/mermaid/mermaid.min.js", found)
        self.assertIn("refresh vendor", found)

    def test_vendor_file_missing_from_the_lock_is_reported(self):
        self.write_lock([self.package({"package/a.js": "mermaid/mermaid.min.js"}, {"mermaid/mermaid.min.js": sha256(STUB)})])
        self.assertIn("assets/vendor/scalar/standalone.js", "\n".join(site.check_assets(self.config)))

    def test_lock_without_file_digests_is_reported(self):
        package = self.package({"package/a.js": "mermaid/mermaid.min.js"}, {})
        del package["sha256"]
        self.write_lock([package, self.package({"package/b.js": "scalar/standalone.js"}, {"scalar/standalone.js": sha256(STUB)})])
        self.assertIn("sha256", "\n".join(site.check_assets(self.config)))

    def test_target_without_a_digest_in_the_lock_is_reported(self):
        self.write_lock(
            [
                self.package({"package/a.js": "mermaid/mermaid.min.js"}, {}),
                self.package({"package/b.js": "scalar/standalone.js"}, {"scalar/standalone.js": sha256(STUB)}),
            ]
        )
        found = "\n".join(site.check_assets(self.config))
        self.assertIn("assets/vendor/mermaid/mermaid.min.js", found)
        self.assertIn("sha256", found)

    def test_absent_vendor_files_stay_a_warning(self):
        self.write_lock([self.package({"package/a.js": "mermaid/mermaid.min.js"}, {"mermaid/mermaid.min.js": sha256(b"x")})])
        shutil.rmtree(self.site / "assets" / "vendor")
        self.assertEqual(site.check_assets(self.config), [])


class RefreshVendorDigestTest(unittest.TestCase):
    def setUp(self):
        self.tmp, self.site, self.config = fixture_site()
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def test_refresh_records_file_digests_in_the_lock(self):
        content = b"console.log('vendored')\n"
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
            info = tarfile.TarInfo("package/dist/lib.js")
            info.size = len(content)
            archive.addfile(info, io.BytesIO(content))
        tarball = buffer.getvalue()
        integrity = "sha512-" + base64.b64encode(hashlib.sha512(tarball).digest()).decode()
        lock = self.tmp / "vendor.lock.json"
        lock.write_text(
            json.dumps({"packages": [{"name": "lib", "version": "1.0.0", "license": "MIT", "tarball": "https://example.invalid/lib.tgz", "integrity": integrity, "files": {"package/dist/lib.js": "lib/lib.js"}}]}),
            encoding="utf-8",
        )
        with mock.patch.object(refresh, "_download", return_value=tarball):
            refresh.refresh_vendor(self.config, lock)
        written = json.loads(lock.read_text(encoding="utf-8"))
        self.assertEqual(written["packages"][0]["sha256"], {"lib/lib.js": sha256(content)})
        self.assertEqual((self.site / "assets" / "vendor" / "lib" / "lib.js").read_bytes(), content)


    def test_refresh_writes_nothing_when_a_later_package_fails_integrity(self):
        good = self.tarball("package/dist/a.js", b"a\n")
        bad = self.tarball("package/dist/b.js", b"b\n")
        lock = self.tmp / "vendor.lock.json"
        packages = [
            {"name": "a", "version": "1", "license": "MIT", "tarball": "a", "integrity": self.integrity(good), "files": {"package/dist/a.js": "a/a.js"}},
            {"name": "b", "version": "1", "license": "MIT", "tarball": "b", "integrity": "sha512-" + base64.b64encode(b"x" * 64).decode(), "files": {"package/dist/b.js": "b/b.js"}},
        ]
        lock.write_text(json.dumps({"packages": packages}), encoding="utf-8")
        before = lock.read_text(encoding="utf-8")
        with mock.patch.object(refresh, "_download", side_effect=lambda url: good if url == "a" else bad):
            with self.assertRaises(refresh.RefreshError):
                refresh.refresh_vendor(self.config, lock)
        self.assertFalse((self.site / "assets" / "vendor" / "a" / "a.js").exists())
        self.assertEqual(lock.read_text(encoding="utf-8"), before)

    @staticmethod
    def tarball(member: str, content: bytes) -> bytes:
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
            info = tarfile.TarInfo(member)
            info.size = len(content)
            archive.addfile(info, io.BytesIO(content))
        return buffer.getvalue()

    @staticmethod
    def integrity(data: bytes) -> str:
        return "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode()


if __name__ == "__main__":
    unittest.main()

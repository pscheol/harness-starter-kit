import unittest

from docskit import markdown


class MarkdownTest(unittest.TestCase):
    def test_escapes_html_and_keeps_inline_code(self):
        html = markdown.render("a <b> `<x>` **굵게** [링크](F-NOTE-01.md#요구사항)").html
        self.assertIn("a &lt;b&gt; <code>&lt;x&gt;</code> <strong>굵게</strong>", html)
        self.assertIn('href="F-NOTE-01.html#요구사항"', html)

    def test_table_with_pipe_in_code(self):
        html = markdown.render("| a | b |\n|---|---|\n| `x|y` | 2 |").html
        self.assertIn("<td><code>x|y</code></td><td>2</td>", html)

    def test_links_with_unsafe_schemes_become_plain_text(self):
        for url in ("javascript:alert%281%29", "JavaScript:alert(1)", "data:text/html,x", "vbscript:x"):
            with self.subTest(url=url):
                html = markdown.render(f"[누르기]({url})").html
                self.assertNotIn("<a ", html)
                self.assertIn("누르기", html)

    def test_safe_links_are_kept(self):
        html = markdown.render("[a](https://example.com/x) [b](mailto:a@example.com) [c](../rules/x.md) [d](#절)").html
        for target in ('href="https://example.com/x"', 'href="mailto:a@example.com"', 'href="../rules/x.md"', 'href="#절"'):
            self.assertIn(target, html)

    def test_manuscript_table_is_marked_for_wrapping_rules(self):
        html = markdown.render("| ID | 요구 | 출처 |\n|---|---|---|\n| FR-1 | 된다 | `a/b/c.md` |").html
        self.assertIn('<div class="table md"><table>', html)

    def test_mermaid_and_code_blocks(self):
        html = markdown.render("```mermaid\nflowchart LR\n  A-->B\n```\n```kotlin\nval a = 1 < 2\n```").html
        self.assertIn('<pre class="mermaid">flowchart LR\n  A--&gt;B</pre>', html)
        self.assertIn('<code class="language-kotlin">val a = 1 &lt; 2</code>', html)

    def test_nested_list_and_checkbox(self):
        html = markdown.render("- 하나\n  - 둘\n- [x] 셋").html
        self.assertEqual(html.count("<ul>"), 2)
        self.assertIn('<span class="check">☑</span> 셋', html)

    def test_headings_and_sections(self):
        text = "# F-1 제목\n\n앞말\n\n## 개요\n\n본문\n\n## 정책\n\n```\n## 코드 안 제목\n```\n"
        parts = markdown.sections(text)
        self.assertEqual(parts["_title"], "F-1 제목")
        self.assertEqual(parts["개요"], "본문")
        self.assertIn("## 코드 안 제목", parts["정책"])
        rendered = markdown.render("## 개요", heading_offset=0, anchor_prefix="f1-")
        self.assertEqual(rendered.headings[0].anchor, "f1-개요")

    def test_flag(self):
        self.assertIn('<span class="flag">NEEDS CLARIFICATION: 누가?</span>', markdown.render("[NEEDS CLARIFICATION: 누가?]").html)

    def test_tables_in(self):
        tables = markdown.tables_in("x\n\n| ID | 요구 |\n|---|---|\n| FR-1 | 저장 |\n")
        self.assertEqual(tables, [(["ID", "요구"], [["FR-1", "저장"]])])


if __name__ == "__main__":
    unittest.main()

import ast
import io
import json
import re
import types
import unittest
import uuid
import zipfile
from datetime import datetime, timezone
from html import escape as html_escape
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_server_helpers():
    source = (ROOT / "server.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    wanted_functions = {
        "_postprocess",
        "_ollama_chat_payload",
        "_preserve_html_tables",
        "_remove_duplicate_display_math",
        "_dedup_lines",
        "_latex_to_unicode",
        "_convert_math_interior",
        "_parse_md_table",
        "_parse_ocr_text",
        "_render_epub_inline",
        "_render_epub_elements",
        "_epub_chapter_xhtml",
        "_build_epub",
    }
    wanted_classes = {"_TableParser"}
    nodes = [
        node for node in tree.body
        if (
            isinstance(node, ast.FunctionDef) and node.name in wanted_functions
        ) or (
            isinstance(node, ast.ClassDef) and node.name in wanted_classes
        )
    ]
    module = ast.Module(body=nodes, type_ignores=[])
    ast.fix_missing_locations(module)

    latex_data = json.loads((ROOT / "latex_unicode.json").read_text(encoding="utf-8"))
    namespace = {
        "HTMLParser": HTMLParser,
        "_ExportPage": object,
        "_LATEX_SIMPLE": sorted(latex_data["simple"].items(), key=lambda x: -len(x[0])),
        "_LATEX_FRACTIONS": latex_data.get("fractions", {}),
        "_CIRCLED": {str(i): chr(0x2460 + i - 1) for i in range(1, 21)},
        "OLLAMA_MODEL": "glm-ocr",
        "OLLAMA_NUM_CTX": 16384,
        "datetime": datetime,
        "timezone": timezone,
        "html_escape": html_escape,
        "io": io,
        "re": re,
        "uuid": uuid,
        "zipfile": zipfile,
    }
    exec(compile(module, str(ROOT / "server.py"), "exec"), namespace)
    return namespace


class PostprocessTests(unittest.TestCase):
    def setUp(self):
        self.helpers = load_server_helpers()

    def test_postprocess_preserves_html_table_structure(self):
        text = """```markdown
<table>
<tr><th>列A</th><th>列B</th></tr>
<tr><td>1</td><td>2</td></tr>
<tr><td>3</td><td>4</td></tr>
</table>
```"""

        result = self.helpers["_postprocess"](text)

        self.assertIn("<table>", result)
        self.assertEqual(result.count("<tr>"), 3)
        self.assertIn("<td>3</td><td>4</td>", result)

    def test_postprocess_deduplicates_text_outside_html_tables_only(self):
        text = """题干 $x$
$$x$$
<table>
<tr><td>同名</td></tr>
<tr><td>同名</td></tr>
</table>"""

        result = self.helpers["_postprocess"](text)

        self.assertNotIn("$$x$$", result)
        self.assertEqual(result.count("<tr>"), 2)
        self.assertEqual(result.count("<td>同名</td>"), 2)


class OllamaPayloadTests(unittest.TestCase):
    def setUp(self):
        self.helpers = load_server_helpers()

    def test_chat_payload_sets_num_ctx_for_image_ocr(self):
        payload = self.helpers["_ollama_chat_payload"]("OCR", "abc123")

        self.assertEqual(payload["model"], "glm-ocr")
        self.assertFalse(payload["stream"])
        self.assertEqual(payload["options"]["num_ctx"], 16384)
        self.assertEqual(payload["messages"][0]["content"], "OCR")
        self.assertEqual(payload["messages"][0]["images"], ["abc123"])


class EpubExportTests(unittest.TestCase):
    def setUp(self):
        self.helpers = load_server_helpers()

    def test_build_epub_contains_valid_container_and_table_page(self):
        pages = [
            types.SimpleNamespace(
                num=1,
                text="| 列A | 列B |\n| --- | --- |\n| 1 | 2 |",
            )
        ]

        buf = self.helpers["_build_epub"]("测试文档", pages)

        with zipfile.ZipFile(buf) as zf:
            names = zf.namelist()
            self.assertEqual(names[0], "mimetype")
            self.assertIn("META-INF/container.xml", names)
            self.assertIn("OEBPS/content.opf", names)
            self.assertIn("OEBPS/nav.xhtml", names)
            self.assertIn("OEBPS/page_001.xhtml", names)

            page = zf.read("OEBPS/page_001.xhtml").decode("utf-8")
            self.assertIn("<table>", page)
            self.assertIn("<th>列A</th>", page)
            self.assertIn("<td>2</td>", page)


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3
"""Input-validator rejection tests; no native conversion or private documents."""
import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject, NameObject

from file_conversion_quality_fixtures import digest, source_contract, validate

ROOT = Path(__file__).resolve().parents[1]
LEGACY = ROOT / "tests/fixtures/fileConversion"
QUALITY = LEGACY / "quality"


class QualityContracts(unittest.TestCase):
    def setUp(self):
        self.manifest = json.loads((QUALITY / "expected.json").read_text())

    def case(self, case_id):
        return next(c for c in self.manifest["cases"] if c["id"] == case_id)

    def test_committed_inputs_validate(self):
        self.assertEqual(validate(self.manifest, QUALITY, LEGACY), (22, 11))

    def test_full_text_loss_is_rejected(self):
        self.case("P01")["target"]["orderedEditableText"].pop()
        with self.assertRaisesRegex(AssertionError, "full target text mismatch"):
            validate(self.manifest, QUALITY, LEGACY)

    def test_column_order_swap_is_rejected(self):
        t = self.case("P02")["target"]
        t["orderedEditableText"][3], t["orderedEditableText"][4] = t["orderedEditableText"][4], t["orderedEditableText"][3]
        t["fullEditableText"] = "\n".join(t["orderedEditableText"])
        with self.assertRaisesRegex(AssertionError, "column reading order"):
            validate(self.manifest, QUALITY, LEGACY)

    def test_cell_map_overlap_is_rejected(self):
        self.case("P03")["target"]["table"]["cells"][1]["column"] = 1
        with self.assertRaisesRegex(AssertionError, "overlapping cell map"):
            validate(self.manifest, QUALITY, LEGACY)

    def test_geometry_outside_page_is_rejected(self):
        self.case("P05")["target"]["figures"][0]["bboxPt"][2] = 1000
        with self.assertRaisesRegex(AssertionError, "out-of-page"):
            validate(self.manifest, QUALITY, LEGACY)

    def test_unexecuted_lifecycle_cannot_claim_pass(self):
        self.manifest["scenarios"][-1]["executionStatus"] = "passed"
        with self.assertRaisesRegex(AssertionError, "cannot claim success"):
            validate(self.manifest, QUALITY, LEGACY)

    def test_missing_acceptance_id_is_rejected(self):
        self.manifest["scenarios"].pop()
        with self.assertRaisesRegex(AssertionError, "missing or duplicate"):
            validate(self.manifest, QUALITY, LEGACY)

    def test_font_detail_bound_contract_is_rejected(self):
        f04 = next(s for s in self.manifest["scenarios"] if s["id"] == "F04")
        f04["expectedAggregate"]["detailCount"] = 125
        with self.assertRaisesRegex(AssertionError, "truncation target"):
            validate(self.manifest, QUALITY, LEGACY)

    def test_changed_fixture_hash_is_rejected(self):
        self.case("P01")["sha256"] = "0" * 64
        with self.assertRaisesRegex(AssertionError, "hash mismatch"):
            validate(self.manifest, QUALITY, LEGACY)

    def test_unidentified_font_source_is_rejected(self):
        self.manifest["font"]["sha256"] = "0" * 64
        with self.assertRaisesRegex(AssertionError, "source font digest"):
            validate(self.manifest, QUALITY, LEGACY)

    def altered_pdf(self, case_id, transform):
        temporary = tempfile.TemporaryDirectory(prefix="zero-quality-mutation-")
        self.addCleanup(temporary.cleanup)
        out = Path(temporary.name) / "quality"
        shutil.copytree(QUALITY, out)
        for name in ("expected.json", "encrypted.pdf", "malformed.pdf", "rich-layout.docx"):
            shutil.copy2(LEGACY / name, out.parent / name)
        path = out / f"{case_id}.pdf"
        reader = PdfReader(path)
        page = reader.pages[0]
        content = page.get_contents().get_data()
        changed = transform(content)
        self.assertNotEqual(content, changed, "test must mutate the actual drawing")
        stream = DecodedStreamObject(); stream.set_data(changed)
        page[NameObject("/Contents")] = stream
        writer = PdfWriter(); writer.add_page(page)
        with path.open("wb") as file: writer.write(file)
        case = self.case(case_id)
        case["sha256"] = digest(path)
        case["source"] = source_contract(path)
        return out

    def test_drawing_that_contradicts_merge_is_rejected_even_with_new_hash(self):
        out = self.altered_pdf("P03", lambda data: data.replace(b"214 586 m 214 514 l", b"214 622 m 214 514 l"))
        with self.assertRaisesRegex(AssertionError, "merged-cell line segments"):
            validate(self.manifest, out, out.parent)

    def test_chart_replaced_by_no_vector_is_rejected_even_with_new_hash(self):
        out = self.altered_pdf("P06", lambda data: data.replace(b" l ", b" m "))
        with self.assertRaisesRegex(AssertionError, "real vector chart"):
            validate(self.manifest, out, out.parent)

    def test_regeneration_is_deterministic_and_preserves_legacy(self):
        spec = importlib.util.spec_from_file_location("fixture_generator", ROOT / "scripts/generate-file-conversion-fixtures.py")
        generator = importlib.util.module_from_spec(spec); spec.loader.exec_module(generator)
        from file_conversion_quality_fixtures import generate
        before = {p.name: digest(p) for p in LEGACY.iterdir() if p.is_file()}
        with tempfile.TemporaryDirectory(prefix="zero-quality-determinism-") as temporary:
            out = Path(temporary)
            generate(out, LEGACY, generator.embed_docx_font, generator.obfuscate_openxml_font)
            first = {p.name: digest(p) for p in out.iterdir()}
            generate(out, LEGACY, generator.embed_docx_font, generator.obfuscate_openxml_font)
            self.assertEqual(first, {p.name: digest(p) for p in out.iterdir()})
            self.assertEqual(first, {p.name: digest(p) for p in QUALITY.iterdir() if p.is_file() and p.suffix in {".pdf", ".docx", ".json"}})
        self.assertEqual(before, {p.name: digest(p) for p in LEGACY.iterdir() if p.is_file()})


if __name__ == "__main__":
    unittest.main()

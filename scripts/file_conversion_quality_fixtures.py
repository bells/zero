"""Synthetic acceptance inputs and future targets; never an engine pass report."""
from __future__ import annotations

import hashlib
import json
import tempfile
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt
from lxml import etree
from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader, PdfWriter
from reportlab.pdfbase import pdfmetrics
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}
PAGE = [612, 792]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalized_zip(path):
    with zipfile.ZipFile(path) as source:
        entries = {name: source.read(name) for name in source.namelist()}
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as package:
        for name in sorted(entries):
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            package.writestr(info, entries[name])


def source_contract(path):
    if path.suffix == ".pdf":
        reader = PdfReader(path)
        return {"pageSizesPt": [[float(p.mediabox.width), float(p.mediabox.height)] for p in reader.pages],
                "pageRotations": [int(p.get("/Rotate", 0)) for p in reader.pages],
                "fullTextByPage": [p.extract_text() or "" for p in reader.pages],
                "imageCountByPage": [len(p.images) for p in reader.pages]}
    with zipfile.ZipFile(path) as package:
        parts = sorted(n for n in package.namelist() if n == "word/document.xml" or n.startswith(("word/header", "word/footer", "word/footnotes", "word/endnotes")) and n.endswith(".xml"))
        return {"fullTextByPart": {n: etree.fromstring(package.read(n)).xpath("//w:t/text()", namespaces=NS) for n in parts},
                "sectionSizesTwips": etree.fromstring(package.read("word/document.xml")).xpath("//w:pgSz/@w:w | //w:pgSz/@w:h", namespaces=NS)}


def generate(output: Path, legacy: Path, embed_font, obfuscate_font):
    output.mkdir(parents=True, exist_ok=True)
    cases = []
    scenarios = []
    with tempfile.TemporaryDirectory(prefix="zero-quality-") as temporary:
        temporary = Path(temporary)
        font = temporary / "cjk.ttf"
        with zipfile.ZipFile(legacy / "rich-layout.docx") as package:
            table = etree.fromstring(package.read("word/fontTable.xml"))
            embed = table.xpath("//w:embedRegular", namespaces=NS)[0]
            key = uuid.UUID(embed.get(qn("w:fontKey")).strip("{}"))
            font.write_bytes(obfuscate_font(package.read("word/fonts/Noto Sans SC.odttf"), key))
        font_digest = digest(font)
        pdfmetrics.registerFont(TTFont("QualityFixtureCJK", str(font)))
        # Wheel-dependent RAQM availability must not silently change fixture kerning.
        raster_font = ImageFont.truetype(str(font), 30, layout_engine=ImageFont.Layout.BASIC)
        picture = temporary / "figure.png"
        Image.new("RGB", (240, 120), "#3978C5").save(picture)

        def pdf(case_id):
            path = output / f"{case_id}.pdf"
            c = Canvas(str(path), pagesize=PAGE, invariant=1)
            c.setTitle(f"Zero synthetic quality {case_id}")
            c.setAuthor("Zero synthetic fixture generator")
            return path, c

        def text(c, value, x=54, top=72, size=12):
            c.setFont("QualityFixtureCJK", size)
            c.drawString(x, PAGE[1] - top, value)

        def scan(c, lines, box=(54, 160, 500, 240)):
            image = Image.new("RGB", (1000, 480), "white")
            draw = ImageDraw.Draw(image)
            for index, value in enumerate(lines):
                draw.text((28, 70 + index * 70), value, font=raster_font, fill="black", anchor="ls")
            file = temporary / "scan.png"
            image.save(file)
            x, y, width, height = box
            c.drawImage(ImageReader(image), x, PAGE[1] - y - height, width, height)

        def figure(c, box=(54, 270, 240, 120)):
            x, y, width, height = box
            c.drawImage(ImageReader(str(picture)), x, PAGE[1] - y - height, width, height)

        def chart(c, top=180):
            def label(value, x, y):
                c.setFont("Helvetica", 12)
                c.drawString(x, PAGE[1] - y, value)

            bottom = PAGE[1] - top - 150
            c.setLineWidth(1)
            c.line(54, bottom, 294, bottom)
            c.line(54, bottom, 54, bottom + 140)
            p = c.beginPath()
            p.moveTo(70, bottom + 20)
            p.lineTo(140, bottom + 90)
            p.lineTo(210, bottom + 60)
            p.lineTo(280, bottom + 120)
            c.drawPath(p)
            label("Legend A: 2, 9, 6, 12", 72, top + 170)
            # A vector fraction and radical, with labels in the same bounded figure.
            c.line(350, bottom + 75, 450, bottom + 75)
            p = c.beginPath()
            p.moveTo(330, bottom + 75)
            p.lineTo(335, bottom + 65)
            p.lineTo(342, bottom + 100)
            p.lineTo(455, bottom + 100)
            c.drawPath(p)
            label("x + 1", 375, top + 60)
            label("y", 390, top + 95)

        def target(case_id, path, ordered, *, error=None, warnings=None, **extra):
            entry = {"id": case_id, "kind": "document", "file": path.name,
                     "sha256": digest(path), "source": source_contract(path),
                     "target": {"orderedEditableText": ordered, "fullEditableText": "\n".join(ordered),
                                "normalization": "NFC; whitespace runs to one space; trim lines; preserve every non-whitespace character",
                                "warnings": warnings or [], "error": error, "noPartialCommit": True, **extra}}
            cases.append(entry)

        path, c = pdf("P01")
        lines = ["P01 Heading one", "P01 Heading two", "English body. 中文测试内容", "P01 Right aligned", "P01 Indented body"]
        for i, value in enumerate(lines):
            text(c, value, 300 if i == 3 else 78 if i == 4 else 54, 72 + 40 * i, 18 if i == 0 else 14 if i == 1 else 12)
        c.save()
        target("P01", path, lines, paragraphs=[{"heading": 1}, {"heading": 2}, {"alignment": "left"}, {"alignment": "right"}, {"leftIndentPt": 24}], pageSizesPt=[PAGE])

        path, c = pdf("P02")
        lines = ["P02 Header", "P02 Spanning title", "P02 Left one", "P02 Left two", "P02 Right one", "P02 Right two", "P02 Page 1"]
        text(c, lines[0], top=30)
        text(c, lines[1], top=90, size=18)
        for index in range(2):
            text(c, lines[2 + index], top=160 + index * 35)
            text(c, lines[4 + index], x=340, top=160 + index * 35)
        text(c, lines[-1], top=760)
        c.save()
        target("P02", path, lines, regions=[{"role": "leftColumn", "bboxPt": [54, 140, 220, 100]}, {"role": "rightColumn", "bboxPt": [340, 140, 218, 100]}])

        cells = [{"row": 0, "column": 0, "rowSpan": 1, "columnSpan": 2, "text": "P03 Merged header"},
                 {"row": 0, "column": 2, "rowSpan": 1, "columnSpan": 1, "text": "P03 H3"},
                 {"row": 1, "column": 0, "rowSpan": 2, "columnSpan": 1, "text": "P03 Vertical"},
                 *[{"row": r, "column": col, "rowSpan": 1, "columnSpan": 1, "text": f"P03 R{r}C{col}"} for r in (1, 2) for col in (1, 2)]]
        path, c = pdf("P03")
        for top in (170, 206, 278):
            c.line(54, 792 - top, 534, 792 - top)
        c.line(214, 792 - 242, 534, 792 - 242)
        for x in (54, 374, 534):
            c.line(x, 792 - 170, x, 792 - 278)
        c.line(214, 792 - 206, 214, 792 - 278)
        for cell in cells:
            text(c, cell["text"], 60 + 160 * cell["column"], 192 + 36 * cell["row"], 10)
        c.save()
        target("P03", path, [v["text"] for v in cells], table={"rows": 3, "columns": 3, "bboxPt": [54, 170, 480, 108], "columnWidthsPt": [160, 160, 160], "cells": cells, "requiredOOXML": ["w:tbl", "w:gridSpan=2", "w:vMerge=restart", "w:vMerge=continue"], "uniqueText": True})

        path, c = pdf("P04")
        lines = []
        for row in range(3):
            for col in range(3):
                value = f"P04 R{row}C{col}"
                lines.append(value)
                text(c, value, 54 + col * 160, 120 + row * 36)
        c.save()
        target("P04", path, lines, warnings=[{"code": "tableSimplified", "sourcePage": 1}], tableReadingOrder="rowMajor", nativeTableRequired=False)

        path, c = pdf("P05")
        text(c, "P05 Before figure", top=120)
        figure(c)
        text(c, "P05 After figure", top=450)
        c.save()
        target("P05", path, ["P05 Before figure", "P05 After figure"], contentOrder=["paragraph:0", "figure:0", "paragraph:1"], figures=[{"bboxPt": [54, 270, 240, 120], "aspectRatio": 2, "tolerancePt": 2}])

        for case_id in ("P06", "P07", "P14"):
            path, c = pdf(case_id)
            if case_id != "P14":
                text(c, f"{case_id} Before graphic", top=120)
            chart(c)
            if case_id == "P07":
                text(c, "P07 Overlapping required body", 90, 240)
            if case_id != "P14":
                text(c, f"{case_id} After graphic", top=480)
            c.save()
            target(case_id, path, ["P06 Before graphic", "P06 After graphic"] if case_id == "P06" else [], error=None if case_id == "P06" else "unsupportedInput", warnings=[{"code": "nonEditableGraphic", "sourcePage": 1}] if case_id == "P06" else [], figures=[{"bboxPt": [48, 174, 414, 190], "labels": ["Legend A: 2, 9, 6, 12", "x + 1", "y"], "editable": False}], forbidden=["wholePageImage", "hiddenText", "OMML", "nativeChart"])

        path, c = pdf("P08")
        lines = []
        for rotation in (90, 180, 270):
            layer, scanned = f"P08 Digital {rotation}", f"P08 Scan {rotation}"
            lines.extend([layer, scanned])
            text(c, layer)
            scan(c, [scanned])
            c.showPage()
        c.save()
        reader, writer = PdfReader(path), PdfWriter()
        for page, rotation in zip(reader.pages, (90, 180, 270)):
            writer.add_page(page.rotate(rotation))
        with path.open("wb") as stream:
            writer.write(stream)
        target("P08", path, lines, warnings=[{"code": "ocrUsed", "sourcePage": p} for p in (1, 2, 3)], outputRotations=[0, 0, 0], coordinateSpace="unrotated top-left points", regions=[{"sourcePage": p, "bboxPt": [54, 160, 500, 240], "text": [f"P08 Scan {r}"]} for p, r in enumerate((90, 180, 270), 1)])

        path, c = pdf("P09")
        text(c, "P09 Before blank"); c.showPage(); c.showPage()
        scan(c, [], (0, 0, 612, 792)); c.showPage()
        text(c, "P09 After blank"); c.save()
        target("P09", path, ["P09 Before blank", "P09 After blank"], pageSizesPt=[PAGE] * 4, blankPages=[2, 3], allBlankCompanion={"file": "../editable-blank.pdf", "sha256": digest(legacy / "editable-blank.pdf"), "error": "unsupportedInput"})

        for case_id in ("P10", "P11", "P12", "P13"):
            path, c = pdf(case_id)
            heading, body = f"{case_id} Digital heading", f"{case_id} Scanned body. 中文测试内容"
            if case_id in ("P10", "P11", "P13"):
                text(c, heading)
            scan(c, [body])
            if case_id == "P11":
                # Reliable searchable overlay over the same raster text, not another OCR region.
                overlay = c.beginText(68, PAGE[1] - 195)
                overlay.setFont("QualityFixtureCJK", 15)
                overlay.setTextRenderMode(3)
                overlay.textOut(body)
                c.drawText(overlay)
            if case_id == "P12":
                chart(c, 450)
            else:
                figure(c, (54, 450, 240, 120))
            c.save()
            ordered = [body] if case_id == "P12" else [heading, body]
            target(case_id, path, [] if case_id == "P13" else ordered, error="ocrRequired" if case_id == "P13" else None, warnings=[] if case_id in ("P11", "P13") else [{"code": "ocrUsed", "sourcePage": 1}] + ([{"code": "nonEditableGraphic", "sourcePage": 1}] if case_id == "P12" else []), regions=[{"role": "requiredBody", "bboxPt": [54, 160, 500, 240], "expectedText": [body]}], contentOrder=(["paragraph:0", "figure:0"] if case_id == "P12" else ["paragraph:0", "paragraph:1", "figure:0"]), uniqueText=True, injection="OCR provider unavailable or required region failure" if case_id == "P13" else None)

        path, c = pdf("P15")
        text(c, "P15 Ambiguous first", 170, 300)
        c.saveState(); c.translate(170, 492); c.rotate(37)
        c.setFont("QualityFixtureCJK", 12); c.drawString(0, 0, "P15 Ambiguous second"); c.restoreState()
        c.save()
        target("P15", path, [], error="unsupportedInput", forbidden=["partialCommit", "wholePageImage"])
        cases.append({"id": "P16", "kind": "invalidDocuments", "inputs": [{"file": "../encrypted.pdf", "sha256": digest(legacy / "encrypted.pdf"), "error": "passwordRequired"}, {"file": "../malformed.pdf", "sha256": digest(legacy / "malformed.pdf"), "error": "invalidInput"}], "target": {"orderedEditableText": [], "fullEditableText": "", "warnings": [], "noPartialCommit": True, "forbidden": ["imageFallback", "network", "modelDownload"]}})

        def save_docx(case_id, doc):
            path = output / f"{case_id}.docx"
            doc.core_properties.created = datetime(2026, 1, 1, tzinfo=timezone.utc)
            doc.core_properties.modified = datetime(2026, 1, 1, tzinfo=timezone.utc)
            doc.core_properties.author = "Zero synthetic fixture generator"
            doc.save(path)
            embed_font(path, font)
            normalized_zip(path)
            return path

        def document():
            doc = Document()
            section = doc.sections[0]
            section.page_width, section.page_height = Inches(8.5), Inches(11)
            for p in ("top_margin", "bottom_margin", "left_margin", "right_margin"):
                setattr(section, p, Inches(0.75))
            doc.styles["Normal"].font.name = "Noto Sans SC"
            doc.styles["Normal"].font.size = Pt(11)
            return doc

        doc = document()
        p = doc.add_paragraph("F01 Missing family body. 中文测试内容")
        p.runs[0].font.name = "ZeroFixtureDefinitelyMissingFamily20261103"
        path = save_docx("F01", doc)
        target("F01", path, [p.text], warnings=[{"code": "fontMissing", "family": "ZeroFixtureDefinitelyMissingFamily20261103", "sourceSection": 1}], substitution={"onlyNameWhenKnown": True, "neverDownload": True})

        doc = document()
        p = doc.add_paragraph("F02 Embedded font. 中文测试内容")
        p.runs[0]._element.get_or_add_rPr().append(OxmlElement("w:rFonts"))
        p.runs[0]._element.rPr.rFonts.set(qn("w:asciiTheme"), "minorHAnsi")
        path = save_docx("F02", doc)
        target("F02", path, [p.text], embeddedFont={"family": "Noto Sans SC", "usableRouteRequired": True}, subsetPdf={"file": "P01.pdf", "ignoreSubsetPrefix": True}, themeFont="minorHAnsi")

        for case_id in ("D01", "D02", "D03", "D04"):
            doc = document()
            lines = []
            if case_id == "D01":
                doc.sections[0].header.paragraphs[0].text = "D01 Header"
                doc.sections[0].footer.paragraphs[0].text = "D01 Footer"
                lines = ["D01 First page. 中文测试内容", "D01 Second page", "D01 Footnote", "D01 Endnote"]
                p = doc.add_paragraph(lines[0])
                # Notes are real OOXML parts and references, patched below after saving.
                for tag, note_id in (("footnoteReference", "1"), ("endnoteReference", "1")):
                    note = OxmlElement("w:" + tag); note.set(qn("w:id"), note_id); p.add_run()._r.append(note)
                doc.add_picture(str(picture), width=Inches(2))
                doc.add_page_break(); doc.add_paragraph(lines[1])
            elif case_id == "D02":
                lines = ["D02 Long table"]
                doc.add_paragraph(lines[0])
                table = doc.add_table(rows=65, cols=3)
                table.style = "Table Grid"
                for r, row in enumerate(table.rows):
                    for col, cell in enumerate(row.cells):
                        value = f"D02 R{r:02}C{col}"
                        lines.append(value); cell.text = value
                    trpr = row._tr.get_or_add_trPr(); trpr.append(OxmlElement("w:cantSplit"))
                doc.add_page_break(); doc.add_page_break()
                doc.add_picture(str(picture), width=Inches(7))
                doc.add_paragraph("D02 After blank and edge image"); lines.append("D02 After blank and edge image")
            elif case_id == "D03":
                sizes = [(11906, 16838), (12240, 15840), (16838, 11906), (15840, 12240)]
                for index, (width, height) in enumerate(sizes):
                    section = doc.sections[0] if index == 0 else doc.add_section(WD_SECTION.NEW_PAGE)
                    section.page_width, section.page_height = Pt(width / 20), Pt(height / 20)
                    value = f"D03 Section {index + 1} {width}x{height} twips"
                    doc.add_paragraph(value); lines.append(value)
            else:
                lines = ["D04 Required image and resource failures"]
                doc.add_paragraph(lines[0]); doc.add_picture(str(picture), width=Inches(2))
            path = save_docx(case_id, doc)
            if case_id == "D01":
                with zipfile.ZipFile(path) as package:
                    entries = {n: package.read(n) for n in package.namelist()}
                rel = etree.fromstring(entries["word/_rels/document.xml.rels"])
                ct = etree.fromstring(entries["[Content_Types].xml"])
                for name, text_value in (("footnotes", lines[2]), ("endnotes", lines[3])):
                    singular = name[:-1]
                    entries[f"word/{name}.xml"] = f'<w:{name} xmlns:w="{W}"><w:{singular} w:id="1"><w:p><w:r><w:t>{text_value}</w:t></w:r></w:p></w:{singular}></w:{name}>'.encode()
                    etree.SubElement(rel, "{http://schemas.openxmlformats.org/package/2006/relationships}Relationship", Id="rIdQuality" + name, Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/" + name, Target=name + ".xml")
                    etree.SubElement(ct, "{http://schemas.openxmlformats.org/package/2006/content-types}Override", PartName=f"/word/{name}.xml", ContentType=f"application/vnd.openxmlformats-officedocument.wordprocessingml.{name}+xml")
                entries["word/_rels/document.xml.rels"] = etree.tostring(rel)
                entries["[Content_Types].xml"] = etree.tostring(ct)
                with zipfile.ZipFile(path, "w") as package:
                    for n, data in entries.items(): package.writestr(n, data)
                normalized_zip(path)
            target(case_id, path, lines, pageSizesPt=([[w / 20, h / 20] for w, h in sizes] if case_id == "D03" else [PAGE] * 2 if case_id == "D01" else None), pageCount=2 if case_id == "D01" else None, pageCountRule="at least three; no row split/duplicate; one explicit blank before final image" if case_id == "D02" else None, unsupportedMixedSectionsMayReject=case_id == "D03", requiredFurniture=["D01 Header", "D01 Footer"] if case_id == "D01" else [], resourceFaults=["imageDecodeFailure", "fontLoadDeadline", "externalRelationshipBlocked"] if case_id == "D04" else [], table={"rows": 65, "columns": 3, "cells": [{"row": r, "column": col, "text": f"D02 R{r:02}C{col}"} for r in range(65) for col in range(3)]} if case_id == "D02" else None)

    definitions = {
        "F03": ("fontInspection", ["font enumerator throws", "family count exceeds bounded limit"], ["readable output may continue", "fontInspectionIncomplete", "never assert complete match", "no font download"]),
        "F04": ("qualityAggregation", ["emit 125 unique issues plus duplicate of first location", "switch locale zh/en"], ["issue details length <= 100", "totalIssues=125", "truncated=true", "duplicate location counted once", "unknown code readable", "no document text or private path"]),
        "E01": ("providerSelection", ["clear synthetic preferences", "LO available; built-in unavailable", "start DOCX input"], ["built-in remains selected", "unavailable reason visible", "LO launch count=0"]),
        "E02": ("preferencePersistence", ["select Word for DOCX", "switch main/tray and locale", "restart host"], ["direction selection preserved", "localized labels", "no document paths or queue persisted"]),
        "E03": ("batchAvailability", ["PDF direction selected provider unavailable", "DOCX direction available", "start mixed queue"], ["only DOCX binds", "PDF reason visible", "no fallback"]),
        "E04": ("batchBinding", ["enqueue two DOCX inputs", "start batch with provider A", "change preference to B before second task", "enqueue future batch"], ["first and second bind A", "future batch binds B", "stale revision rejected"]),
        "E05": ("retryBinding", ["inject Word permissionDenied, notActivated, uninstalled, timeout separately", "ordinary retry", "explicit retry with LO"], ["distinct typed reasons", "ordinary retry stays Word", "only explicit retry binds LO", "no implicit fallback"]),
        "E06": ("preferenceValidation", ["inject atomic preference write failure", "load unknown provider ID", "load opposite-platform provider ID"], ["write failure not reported saved", "invalid IDs normalize default with notice", "no arbitrary command"]),
        "E07": ("generationIsolation", ["cancel or timeout at OCR, packaging, printing separately", "deliver expired region/lease/native callback", "start next task"], ["no final output", "stale generation rejected", "busy native instance not reused", "next task can run after teardown"]),
        "E08": ("safeCommit", ["unreadable synthetic source", "existing destination sentinel", "deny staging commit permission", "retry with invalid direction/provider separately"], ["source and sentinel hashes unchanged", "typed recoverable error", "no partial final output", "retry validation enforced"]),
        "E09": ("callerBoundary", ["call get/set File preferences from engine and unrelated window", "call same IPC from authorized main/tray"], ["unauthorized caller denied", "authorized narrow settings only", "no file/process capability gained"]),
    }
    for case_id, (kind, steps, assertions) in definitions.items():
        scenarios.append({"id": case_id, "kind": "faultScenario" if case_id.startswith("F") else "lifecycleScenario", "fixtureRefs": ["F01"] if case_id == "F03" else ["D01", "P01"], "scenarioType": kind, "setup": "isolated synthetic preferences, staging and event clock; never user data", "steps": steps, "assertions": assertions, "executionStatus": "contractOnly", "requiresHarness": True})
    f04 = next(s for s in scenarios if s["id"] == "F04")
    f04["injectedIssues"] = [{"code": "fixtureUnknownQualityCode" if p == 125 else "nonEditableGraphic", "sourcePage": p} for p in range(1, 126)]
    f04["injectedIssues"].append(dict(f04["injectedIssues"][0]))
    f04["expectedAggregate"] = {"totalIssues": 125, "detailCount": 100, "truncated": True}
    d01_target = next(c for c in cases if c["id"] == "D01")["target"]
    d01_target["fullPdfTextByPage"] = [["D01 Header", "D01 First page. 中文测试内容", "D01 Footnote", "D01 Footer"], ["D01 Header", "D01 Second page", "D01 Endnote", "D01 Footer"]]
    d02_target = next(c for c in cases if c["id"] == "D02")["target"]
    d02_target["pageGeometryRule"] = {"allPagesSizePt": PAGE, "minimumPageCount": 4, "explicitBlankPageCount": 1, "tolerancePt": 1}
    d04_target = next(c for c in cases if c["id"] == "D04")["target"]
    d04_target["faultScenarios"] = [{"injection": i, "expectedError": e, "noPartialCommit": True, "externalRequestCount": 0} for i, e in [("replace required image bytes with invalid PNG", "invalidInput"), ("font readiness never resolves until deadline", "timeout"), ("replace required image relationship by external URL", "unsupportedInput")]]
    manifest = {"schemaVersion": 1, "containsUserData": False, "generatedBy": "scripts/generate-file-conversion-fixtures.py --quality-only", "status": "futureAcceptanceTargetsNotEngineResults", "coordinateSpace": "PDF unrotated top-left points; bbox=[x,y,width,height]; source Rotate separately", "font": {"source": "../rich-layout.docx#word/fonts/Noto Sans SC.odttf", "license": "../assets/OFL.txt", "sha256": font_digest}, "legacyManifestSha256": digest(legacy / "expected.json"), "cases": cases, "scenarios": scenarios}
    (output / "expected.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return manifest


def validate(manifest: dict, output: Path, legacy: Path):
    """Validate input fidelity and scenario completeness, without running conversion."""
    import math
    from pypdf.generic import ContentStream

    def require(condition, message):
        if not condition:
            raise AssertionError("quality: " + message)

    require(manifest.get("containsUserData") is False, "synthetic declaration required")
    require(manifest.get("status") == "futureAcceptanceTargetsNotEngineResults", "must not imply engine success")
    require(manifest.get("legacyManifestSha256") == digest(legacy / "expected.json"), "legacy manifest changed")
    with zipfile.ZipFile(legacy / "rich-layout.docx") as package:
        table = etree.fromstring(package.read("word/fontTable.xml"))
        key = uuid.UUID(table.xpath("//w:embedRegular", namespaces=NS)[0].get(qn("w:fontKey")).strip("{}"))
        data = bytearray(package.read("word/fonts/Noto Sans SC.odttf"))
        for index in range(min(32, len(data))):
            data[index] ^= key.bytes[15 - index % 16]
        require(manifest.get("font", {}).get("sha256") == hashlib.sha256(data).hexdigest(), "licensed source font digest mismatch")
    cases = manifest.get("cases", [])
    scenarios = manifest.get("scenarios", [])
    expected_ids = {f"P{i:02}" for i in range(1, 17)} | {f"F{i:02}" for i in range(1, 5)} | {f"D{i:02}" for i in range(1, 5)} | {f"E{i:02}" for i in range(1, 10)}
    ids = [entry["id"] for entry in cases + scenarios]
    require(len(ids) == len(set(ids)) and set(ids) == expected_ids, "missing or duplicate acceptance ID")
    by_id = {entry["id"]: entry for entry in cases}
    for case in cases:
        case_id = case["id"]
        if case["kind"] == "invalidDocuments":
            for item in case["inputs"]:
                path = output / item["file"]
                require(path.resolve().parent == legacy.resolve(), "invalid input reference escapes corpus")
                require(digest(path) == item["sha256"], "invalid input hash mismatch")
            require([i["error"] for i in case["inputs"]] == ["passwordRequired", "invalidInput"], "P16 typed classifications")
            continue
        path = output / case["file"]
        require(path.resolve().parent == output.resolve(), "input path escapes corpus")
        require(digest(path) == case["sha256"], f"{case_id} hash mismatch")
        require(source_contract(path) == case.get("source"), f"{case_id} source text/geometry/image contract mismatch")
        t = case["target"]
        require(t.get("noPartialCommit") is True, f"{case_id} needs no-partial-commit guarantee")
        require(isinstance(t.get("orderedEditableText"), list), f"{case_id} needs complete text sequence")
        require(t.get("fullEditableText") == "\n".join(t["orderedEditableText"]), f"{case_id} full target text mismatch")
        require(isinstance(t.get("warnings"), list), f"{case_id} missing issue expectations")
        for area in t.get("regions", []) + t.get("figures", []):
            box = area["bboxPt"]
            require(len(box) == 4 and all(isinstance(v, (int, float)) and math.isfinite(v) for v in box), f"{case_id} invalid geometry")
            x, y, width, height = box
            require(x >= 0 and y >= 0 and width > 0 and height > 0 and x + width <= PAGE[0] and y + height <= PAGE[1], f"{case_id} out-of-page geometry")
        if path.suffix == ".pdf":
            reader = PdfReader(path)
            for page in reader.pages:
                for resource in page["/Resources"].get("/Font", {}).values():
                    font_resource = resource.get_object()
                    base = str(font_resource.get("/BaseFont", ""))
                    if "Noto" in base:
                        descriptor = font_resource["/FontDescriptor"]
                        require("/FontFile2" in descriptor, f"{case_id} CJK font not embedded")
        else:
            with zipfile.ZipFile(path) as package:
                require("word/fonts/Noto Sans SC.odttf" in package.namelist(), f"{case_id} licensed font missing")
                for name in package.namelist():
                    if name.endswith(".rels"):
                        relationships = etree.fromstring(package.read(name))
                        require(not relationships.xpath("//*[@TargetMode='External']"), f"{case_id} fixture must not fetch external resources")
        if case_id in {"P01", "P03", "P04", "P05", "P09"}:
            source_lines = [line for page in case["source"]["fullTextByPage"] for line in page.splitlines() if line.strip()]
            require(t["orderedEditableText"] == source_lines, f"{case_id} complete source text/order lost")
    require(by_id["P02"]["target"]["orderedEditableText"] == ["P02 Header", "P02 Spanning title", "P02 Left one", "P02 Left two", "P02 Right one", "P02 Right two", "P02 Page 1"], "P02 column reading order changed")
    p03 = by_id["P03"]
    table = p03["target"]["table"]
    require(table["rows"] == 3 and table["columns"] == 3, "P03 dimensions")
    occupied = set()
    for cell in table["cells"]:
        for row in range(cell["row"], cell["row"] + cell["rowSpan"]):
            for col in range(cell["column"], cell["column"] + cell["columnSpan"]):
                require(0 <= row < 3 and 0 <= col < 3 and (row, col) not in occupied, "P03 overlapping cell map")
                occupied.add((row, col))
    require(len(occupied) == 9, "P03 cell map incomplete")
    require(table["cells"][0]["columnSpan"] == 2 and table["cells"][2]["rowSpan"] == 2, "P03 actual merges required")
    page = PdfReader(output / p03["file"]).pages[0]
    operations = ContentStream(page.get_contents(), page.pdf).operations
    segments, start = [], None
    for args, op in operations:
        if op == b"m": start = tuple(float(v) for v in args)
        if op == b"l" and start is not None:
            segments.append((*start, *(float(v) for v in args)))
    require((214., 586., 214., 514.) in segments and (214., 550., 534., 550.) in segments, "P03 merged-cell line segments missing")
    require((214., 622., 214., 514.) not in segments and (54., 550., 534., 550.) not in segments, "P03 drawn grid contradicts merges")
    for case_id in ("P06", "P07", "P14"):
        page = PdfReader(output / by_id[case_id]["file"]).pages[0]
        operations = ContentStream(page.get_contents(), page.pdf).operations
        require(sum(op == b"l" for _, op in operations) >= 9 and not page.images, f"{case_id} must contain real vector chart/formula")
    require(by_id["P08"]["source"]["pageRotations"] == [90, 180, 270], "P08 rotations incomplete")
    require(by_id["P08"]["source"]["imageCountByPage"] == [1, 1, 1], "P08 scan regions absent")
    require(by_id["P09"]["source"]["imageCountByPage"] == [0, 0, 1, 0], "P09 blank scan missing")
    for case_id in ("P10", "P11", "P12", "P13"):
        require(by_id[case_id]["source"]["imageCountByPage"][0] >= 1, f"{case_id} scan missing")
    require(by_id["P11"]["target"]["warnings"] == [], "P11 must not require redundant OCR")
    require(by_id["P13"]["target"]["error"] == "ocrRequired", "P13 injected OCR unavailable must fail")
    for case_id in ("P07", "P14", "P15"):
        require(by_id[case_id]["target"]["error"] == "unsupportedInput" and not by_id[case_id]["target"]["orderedEditableText"], f"{case_id} cannot produce successful partial document")
    with zipfile.ZipFile(output / "D01.docx") as package:
        for name in ("footnotes", "endnotes"):
            require(f"word/{name}.xml" in package.namelist(), "D01 real note part missing")
            require(f"{name[:-1]}Reference".encode() in package.read("word/document.xml"), "D01 note reference missing")
    with zipfile.ZipFile(output / "D02.docx") as package:
        root = etree.fromstring(package.read("word/document.xml"))
        require(len(root.xpath("//w:tbl/w:tr", namespaces=NS)) == 65, "D02 long table rows missing")
        actual_cells = root.xpath("//w:tbl/w:tr/w:tc//w:t/text()", namespaces=NS)
        require(actual_cells == [c["text"] for c in by_id["D02"]["target"]["table"]["cells"]], "D02 full cell map mismatch")
    require(by_id["D03"]["source"]["sectionSizesTwips"] == ["11906", "16838", "12240", "15840", "16838", "11906", "15840", "12240"], "D03 mixed sizes missing")
    for scenario in scenarios:
        require(scenario.get("kind") in {"faultScenario", "lifecycleScenario"}, "invalid scenario kind")
        require(scenario.get("executionStatus") == "contractOnly" and scenario.get("requiresHarness") is True, "unexecuted scenario cannot claim success")
        require(len(scenario.get("steps", [])) >= 2 and len(scenario.get("assertions", [])) >= 3, "scenario setup/observations incomplete")
        require(all(ref in by_id for ref in scenario["fixtureRefs"]), "scenario references missing input")
    f04 = next(s for s in scenarios if s["id"] == "F04")
    issues = f04.get("injectedIssues", [])
    require(len(issues) == 126 and len({(i["code"], i["sourcePage"]) for i in issues}) == 125, "F04 concrete unique/duplicate injection missing")
    require(f04.get("expectedAggregate") == {"totalIssues": 125, "detailCount": 100, "truncated": True}, "F04 truncation target invalid")
    return len(cases), len(scenarios)

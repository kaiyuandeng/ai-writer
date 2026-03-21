#!/usr/bin/env python3
"""Convert the assembled Hassan novel to a Cabal-themed PDF."""
import sys, os, re, glob

sys.path.insert(0, os.path.expanduser("~/.cursor/skills/generate-pdf/scripts"))
from pdf_gen import PDFDoc

CHAPTERS_DIR = os.path.join(os.path.dirname(__file__), '..', 'chapters')
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'assembled')
PDF_PATH = os.path.join(OUT_DIR, 'hassan.pdf')

PART_LABELS = {
    0: None,
    1: "PART ONE: EARTH",
    15: "PART TWO: THE BRAID",
    27: "PART THREE: HYFE",
    34: None,
}

def get_chapter_files():
    return sorted(glob.glob(os.path.join(CHAPTERS_DIR, '*.md')))

def build_pdf():
    os.makedirs(OUT_DIR, exist_ok=True)
    doc = PDFDoc(PDF_PATH, theme="light-cabal")

    doc.title("HASSAN")
    doc.subtitle("by Kai")
    doc.spacer(0.5)
    doc.meta("A NOVEL • MARCH 2026")
    doc.section_break("•")

    files = get_chapter_files()
    total_words = 0

    for f in files:
        basename = os.path.basename(f)
        num_match = re.match(r'(\d+)', basename)
        chapter_num = int(num_match.group(1)) if num_match else -1

        with open(f, 'r') as fh:
            content = fh.read().strip()

        wc = len(content.split())
        total_words += wc

        if chapter_num in PART_LABELS and PART_LABELS[chapter_num]:
            doc.section_break("• • •")
            doc.spacer(0.3)
            doc.meta(PART_LABELS[chapter_num])
            doc.spacer(0.3)

        lines = content.split('\n')
        first_para = True

        for line in lines:
            line = line.strip()
            if not line:
                continue
            if line.startswith('# '):
                doc.section_break("•")
                doc.subtitle(line[2:].strip())
                doc.spacer(0.15)
                first_para = True
            elif line.startswith('## '):
                doc.spacer(0.2)
                doc.meta(line[3:].strip().upper())
                doc.spacer(0.1)
                first_para = True
            elif line == '---' or line == '***' or line == '• • •':
                doc.section_break()
                first_para = True
            else:
                doc.body(line, first=first_para)
                first_para = False

    doc.spacer(0.5)
    doc.section_break("•")
    doc.colophon(f"HASSAN — A Novel — {total_words:,} words")
    doc.colophon("Generated March 2026")
    doc.build()
    print(f"PDF: {PDF_PATH}")
    print(f"Words: {total_words:,}")
    print(f"Chapters: {len(files)}")

if __name__ == '__main__':
    build_pdf()

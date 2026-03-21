#!/usr/bin/env python3
"""Assemble the Hassan rewrite — concatenate chapters, count words, generate TOC."""
import os, re, glob

CHAPTERS_DIR = os.path.join(os.path.dirname(__file__), '..', 'chapters')
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'assembled')

PART_BREAKS = {
    0: ("PROLOGUE", "Father, I Fear"),
    1: ("PART ONE", "Earth"),
    5: ("", ""),  # City subsection (no extra break needed)
    9: ("", ""),  # Earth 2069 intercut
    15: ("PART TWO", "The Braid"),
    27: ("PART THREE", "Hyfe"),
    34: ("EPILOGUE", "Jaya"),
}

def get_chapter_files():
    files = sorted(glob.glob(os.path.join(CHAPTERS_DIR, '*.md')))
    return files

def word_count(text):
    return len(text.split())

def build():
    os.makedirs(OUT_DIR, exist_ok=True)
    files = get_chapter_files()

    if not files:
        print("No chapter files found.")
        return

    full_text = []
    toc_lines = []
    total_words = 0
    chapter_stats = []

    full_text.append("# HASSAN\n")
    full_text.append("*A novel*\n\n")
    full_text.append("---\n\n")

    for f in files:
        basename = os.path.basename(f)
        num_match = re.match(r'(\d+)', basename)
        chapter_num = int(num_match.group(1)) if num_match else -1

        with open(f, 'r') as fh:
            content = fh.read().strip()

        wc = word_count(content)
        total_words += wc

        title_match = re.match(r'^#\s+(.+)', content)
        title = title_match.group(1) if title_match else basename

        if chapter_num in PART_BREAKS:
            part_label, part_title = PART_BREAKS[chapter_num]
            if part_label:
                full_text.append(f"\n\n---\n\n## {part_label}: {part_title}\n\n---\n\n")
                toc_lines.append(f"\n**{part_label}: {part_title}**")

        toc_lines.append(f"  {basename:<40} {wc:>6} words  — {title}")
        chapter_stats.append((basename, wc, title))

        full_text.append(content)
        full_text.append("\n\n---\n\n")

    assembled = "\n".join(full_text)

    out_path = os.path.join(OUT_DIR, 'hassan-complete.md')
    with open(out_path, 'w') as fh:
        fh.write(assembled)

    print(f"\n{'='*60}")
    print(f"  HASSAN — Assembly Report")
    print(f"{'='*60}\n")
    print(f"  Chapters: {len(files)}")
    print(f"  Total words: {total_words:,}")
    print(f"  Output: {out_path}\n")
    print(f"  {'Chapter':<40} {'Words':>6}")
    print(f"  {'-'*40} {'-'*6}")
    for basename, wc, title in chapter_stats:
        print(f"  {basename:<40} {wc:>6}")
    print(f"  {'-'*40} {'-'*6}")
    print(f"  {'TOTAL':<40} {total_words:>6}")
    print()

if __name__ == '__main__':
    build()

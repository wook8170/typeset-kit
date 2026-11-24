#!/usr/bin/env python3
"""Rebuild the bundled fonts in fonts/ (fixed-weight subsets for the default theme).

  python3 scripts/gen-fonts.py --noto-regular NotoSansKR-Regular.ttf --noto-bold NotoSansKR-Bold.ttf \
      --jetbrains-dir <folder with jetbrains-mono-latin-{400,700}-normal.woff2>

Needs: pip install fonttools brotli   (tested with fontTools 4.58.1)

- Noto Sans KR 400 and 700: static instances of the upstream variable font, cut to Latin, punctuation, symbols,
  all 11,172 Hangul syllables and compatibility jamo. Hinting is dropped. The family name stays "Noto Sans KR"
  (the license reserves only the name "Source").
- JetBrains Mono 400 and 700: the Latin woff2 files of @fontsource/jetbrains-mono, copied without change.
- The output is deterministic: the same inputs give the same bytes. The script prints sha256 values for fonts/FONTS.md.
"""
import argparse, hashlib, os, sys
from fontTools.ttLib import TTFont
from fontTools import subset

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'fonts')

def unicodes():
    chosen = set(range(0x20, 0x7F)) | set(range(0xA0, 0x100))
    for first, last in [(0x2000, 0x2070), (0x2190, 0x2200), (0x2200, 0x2300), (0x2460, 0x2500), (0x25A0, 0x2600),
                        (0x3000, 0x3040), (0x3131, 0x318F), (0xAC00, 0xD7A4), (0xFF01, 0xFF5F)]:
        chosen |= set(range(first, last))
    return chosen | {0x2103, 0x2116, 0x2122}

def sha256(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()

def cut_noto(source_path, weight):
    options = subset.Options()
    options.flavor = 'woff2'
    options.layout_features = ['tnum', 'kern', 'liga', 'calt', 'ccmp', 'locl']
    options.hinting = False
    options.notdef_outline = True
    font = TTFont(source_path, recalcTimestamp=False)
    cutter = subset.Subsetter(options)
    cutter.populate(unicodes=unicodes())
    cutter.subset(font)
    target = os.path.join(OUT, f'NotoSansKR-{weight}.woff2')
    font.flavor = 'woff2'
    font.save(target, reorderTables=True)
    return target

def copy_jetbrains(source_dir, weight):
    source = os.path.join(source_dir, f'jetbrains-mono-latin-{weight}-normal.woff2')
    target = os.path.join(OUT, f'JetBrainsMono-{weight}.woff2')
    with open(source, 'rb') as reader, open(target, 'wb') as writer:
        writer.write(reader.read())
    return source, target

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--noto-regular', required=True)
    parser.add_argument('--noto-bold', required=True)
    parser.add_argument('--jetbrains-dir', required=True)
    args = parser.parse_args()
    os.makedirs(OUT, exist_ok=True)
    for weight, source in ((400, args.noto_regular), (700, args.noto_bold)):
        target = cut_noto(source, weight)
        print(f'{os.path.basename(target)}  {os.path.getsize(target)} B  sha256 {sha256(target)}  (input sha256 {sha256(source)})')
    for weight in (400, 700):
        source, target = copy_jetbrains(args.jetbrains_dir, weight)
        print(f'{os.path.basename(target)}  {os.path.getsize(target)} B  sha256 {sha256(target)}  (input sha256 {sha256(source)})')

if __name__ == '__main__':
    sys.exit(main())

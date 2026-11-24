# typeset-kit

A command-line tool that typesets Markdown manuscripts, book specs and page HTML into PDFs with a table of contents, internal links and bookmarks. The same manuscript also becomes a single-page web edition. It prints with a headless Chrome (or Edge) and embeds fonts and images, so the output does not depend on network access.

[한국어](README.ko.md)

## Requirements

- Node.js 22 or later
- Chrome or Edge
  - Desktop: an installed Chrome or Edge is found automatically. Windows ships with Edge.
  - Server or CI: run `npx @puppeteer/browsers install chrome-headless-shell@stable` and set `CHROME_BIN` to the executable.
  - Offline networks: copy the folder downloaded by that command and set `CHROME_BIN`.

poppler and Python are not needed.

## Quick start

```sh
npx typeset-kit init --locale en   # writes typeset.config.mjs and a sample manuscript under docs/
npx typeset-kit doctor             # checks Node, the browser, bookmark support, fonts and the config
npx typeset-kit build --pdf --web
npx typeset-kit check typeset-out/guide.pdf
```

Output goes to `typeset-out/`.

| File | Contents |
|---|---|
| `guide.pdf` | Cover, document information, contents and body. Contents lines are internal links; chapters and sections are two bookmark levels; the bookmark pane opens with the file |
| `guide.html` | The print HTML just before the PDF |
| `guide.web.html` | Web edition: side contents, a collapsible contents list on narrow screens, light and dark themes, no scripts |
| `typeset-report.json` | Per document: pages, front pages, overflowing pages, bookmarks, links and size |

## Commands

| Command | What it does | Exit code |
|---|---|---|
| `build [id…]` | Builds the documents in the config. Pick outputs with `--pdf`, `--web`, `--html-only`; with none, PDF and print HTML | 1 on overflowing pages, size limit, missing files or SVG allow-list violations (`--allow-overflow` accepts overflow) |
| `check <pdf…>` | Contents lines = bookmarks, link targets, bookmark depth, page labels, bookmark pane, Type 3 fonts, size | 1 if a check fails |
| `check-writing` | Writing rules. `--check` compares with the baseline, `--update-baseline` locks it again | 1 if a cell grows |
| `doctor` | Checks the build environment | 1 if a build cannot run |
| `init` | Sample config and manuscript | 1 if files exist (`--force` overwrites) |

Argument and config errors exit with 2. Messages are in Korean when `TYPESET_KIT_LANG`, `LC_ALL` or `LANG` starts with `ko`.

## Three kinds of input

| Mode | Input | Typical use |
|---|---|---|
| `book` | One or more Markdown files | Guides, reports, white papers |
| `spec` | A book spec (`.mjs` default export or `.json`) | Documents written as blocks |
| `pages` | Several HTML pages already laid out | Brochures and booklets; each page is printed and merged |

### Writing Markdown

- `#` is the document title, `##` a chapter, `###` a section, `####` a subheading. Chapters and sections go into the contents and bookmarks, and are numbered for you.
- Paragraphs between `#` and the first `##` become the cover summary; the first paragraph under a `##` becomes the chapter summary.
- A quote whose first word is bold becomes a callout: `> **Caution** …`. Kinds are Note, Caution and Warning (참고 · 주의 · 경고 in Korean documents).
- A paragraph holding only an image becomes a figure: `![Caption](figures/a.svg)`. SVG goes into the document as it is, so its text uses the embedded fonts. PNGs whose long side is over `limits.imageMaxPx` (2000 by default) are scaled down. Remote images are refused.
- Tables use the GFM syntax and code uses fenced blocks. A code block inside a numbered item appears under that item.
- HTML written in the manuscript shows as text. Only `http`, `https`, `mailto` and `#` links stay clickable.

The full rules are in [docs/contract.md](docs/contract.md), section 4.3.

## Configuration

One file at the repository root: `typeset.config.mjs` (or `.json`). Unknown keys are errors, so typos are not ignored.

```js
export default {
  locale: 'en',
  outDir: 'typeset-out',
  brand: { name: 'Acme Docs', logo: 'assets/mark.svg', publisher: 'Acme Inc.', contact: 'https://example.com' },
  theme: { hue: 250, fonts: { sans: 'builtin:noto-sans-kr', mono: 'builtin:jetbrains-mono' } },
  cover: { meta: [['Document', 'DOC-01']], approvalBox: ['Written', 'Reviewed', 'Approved'] },
  footer: { left: '{brand} {title} · {edition}', right: '{page}' },
  typeset: { landTables: 'auto', tableColWidths: 'content' },
  documents: [
    { id: 'install', mode: 'book', src: 'docs/install.md', revisions: 'docs/install.revisions.json' },
    { id: 'brochure', mode: 'pages', src: 'brochure/*.html', vars: { VERSION: '2.1.0' }, toc: true },
  ],
  writing: { languages: ['en'] },
}
```

All keys and defaults are listed in [docs/contract.md](docs/contract.md), section 2. Each document can override `theme`, `cover`, `header`, `footer` and `typeset`.

## Fonts

Default fonts ship with the package: Noto Sans KR and JetBrains Mono at fixed weights 400 and 700. A variable font would be embedded by Chrome as Type 3 fonts and make the PDF much larger, so the default theme uses only these two weights.

To use another font, give its files in `theme.fonts`: `{ family: 'My Sans', files: [{ path: 'fonts/my-400.woff2', weight: 400 }] }`. A missing font file stops the build, because silently falling back to system fonts gives different results on each machine.

## Writing check

`check-writing` finds hype, metaphors, AI-style phrases, forced translations, personification and long noun chains. With a locked baseline only new findings fail, and a shrinking count prompts you to lock the baseline again. Each rule group can be `off`, `warn`, `ratchet` or `fail`.

Missing connectives and a subject far from its verb are hard to catch by machine; reread the text for those.

## Windows

The same commands work on Windows, macOS and Linux. On Windows the browser is looked up under `%ProgramFiles%` and `%LocalAppData%` (Chrome first, then Edge). No external commands such as `pdfunite` are used.

## License

The code is MIT (`LICENSE`). The bundled fonts are under the SIL Open Font License 1.1; sources and build steps are in `fonts/FONTS.md`, and dependencies are listed in `THIRD-PARTY-NOTICES.md`.

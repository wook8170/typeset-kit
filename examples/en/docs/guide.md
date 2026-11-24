# Writing Guide

This guide shows how to turn one Markdown manuscript into a PDF and a web page. The document is its own example: each syntax it describes appears in the PDF as it would in yours.

## Getting started

How to install the tool and build a first document.

### What you need

Two things are enough.

- Node.js 22 or later
- Chrome or Edge. On a server, download `chrome-headless-shell` and point `CHROME_BIN` to it.

> **Note** The browser runs without a window, so it does not take focus from your work.

### Build a first document

1. Create the config and a sample manuscript in an empty folder.
   ```sh
   npx typeset-kit init --locale en
   ```
2. Check the environment. Fix any failed item as the message says.
   ```sh
   npx typeset-kit doctor
   ```
3. Build the document. The files appear in the `typeset-out` folder.
   ```sh
   npx typeset-kit build --pdf --web
   ```

![From a Markdown manuscript to a PDF and a web page](figures/flow.svg)

## Writing the manuscript

How to write chapters, sections, subheadings and blocks.

### Heading levels

Heading levels decide the table of contents and the bookmarks in the PDF.

| Manuscript | Meaning | Contents and bookmarks |
|---|---|---|
| `#` | Document title | Used on the cover |
| `##` | Chapter | Level 1 |
| `###` | Section | Level 2 |
| `####` | Subheading | Not included |

The first paragraph right under a chapter heading becomes the summary on the chapter opener. Chapter, section and figure numbers are added for you.

#### Why numbers are not written by hand

Moving or deleting a chapter then needs no renumbering.

### Lists and code

Indent bullet items to nest them.

- Cover
  - Title and summary
  - Issue month taken from the revision history
- Contents
- Body

A code block inside a numbered item appears in a box under that item, as in "Build a first document" above. Inline `code` uses a fixed-width font.

### Callouts

A quote whose first word is bold becomes a callout of that kind.

> **Note** Something good to know.

> **Caution** Something hard to undo if missed.

> **Warning** Something that can lose data.

### Figures and tables

Put a figure in a paragraph of its own. An SVG goes into the document as it is, so its text uses the embedded fonts too. A PNG whose long side is over 2000px is scaled down first.

Tables use the GFM table syntax, including centered columns.

| Output | File | Use |
|:-:|---|---|
| PDF | `guide.pdf` | Printing and sharing |
| Print HTML | `guide.html` | The document just before the PDF |
| Web page | `guide.web.html` | Reading on screen |

Links stay clickable in the PDF, for example [the typeset-kit install notes](https://example.com/docs/install).

## Checking

How to check the built PDF and the wording of the manuscript.

### PDF check

The `check` command confirms that the contents lines match the bookmarks, that links go to the right pages, and that page labels exist.

```sh
npx typeset-kit check typeset-out/guide.pdf
```

### Writing check

The `check-writing` command finds banned wording such as hype, metaphors and AI-style phrases. Once a baseline is locked, only new findings fail.

```sh
npx typeset-kit check-writing --update-baseline
npx typeset-kit check-writing --check
```

> **Note** Missing connectives or a subject far from its verb are hard to find by machine. Reread the text to fix them.

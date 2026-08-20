#!/usr/bin/env python3
from pathlib import Path


def replace_or_assert(text: str, old: str, new: str, label: str) -> str:
    if old in text:
        return text.replace(old, new, 1)
    if new in text:
        print(f'already applied: {label}')
        return text
    raise SystemExit(f'missing patch anchor: {label}')


template_path = Path('src/lib/reports/templates/report-template.ts')
template = template_path.read_text()
old_cross_ref = '<p><strong>Management response:</strong> see Leadership decisions and roadmap for accountable executive mandates, escalation authority and the fraud-risk implementation and control-effectiveness review cadence.</p>'
new_cross_ref = '<p><strong>Management response:</strong> see the leadership roadmap section for accountable executive mandates, escalation authority and the fraud-risk implementation and control-effectiveness review cadence.</p>'
template = replace_or_assert(template, old_cross_ref, new_cross_ref, 'governance cross-reference')

old_kicker_css = "  .section-kicker { display: inline-block; background: var(--mk-navy-900); color: var(--mk-white); font-size: 7pt; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; padding: 1.7mm 4mm; margin-bottom: 5mm; }"
new_kicker_css = "  .section-kicker { display: inline-block; background: var(--mk-navy-900); color: var(--mk-white); font-size: 7pt; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; padding: 1.7mm 4mm; margin-bottom: 5mm; break-after: avoid; page-break-after: avoid; }\n  .section-kicker + h2 { break-before: avoid; page-break-before: avoid; }"
template = replace_or_assert(template, old_kicker_css, new_kicker_css, 'section kicker heading keep')
template_path.write_text(template)

nav_path = Path('src/lib/reports/pdf-navigation.ts')
nav = nav_path.read_text()
old_pages = '''  // Every page is read, rather than stopping at the first hit, so a tier's uniqueness can be
  // established. Acceptance itself is unchanged: the first page whose text contains the heading
  // exactly still wins, and nothing else can approve a heading.
  const pages: Array<{ pageNumber: number; exact: string; normalised: string; stripped: string; itemCount: number }> = [];
  for (let pageNumber = startPage; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const exact = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    pages.push({
      pageNumber,
      exact,
      normalised: normaliseWhitespace(exact),
      stripped: stripWhitespace(exact),
      itemCount: content.items.length,
    });
  }
'''
new_pages = '''  // Every page is read so the extractor can distinguish the actual rendered heading from an
  // ordinary prose mention of the same words. REPORT_TOC_ENTRIES are rendered as h2 headings at
  // materially larger text height than body/cross-reference copy. Keep individual pdfjs text items
  // and their rendered height so matching is structural rather than a page-wide substring search.
  type NavigationTextItem = { str: string; height: number };
  const pages: Array<{ pageNumber: number; items: NavigationTextItem[]; itemCount: number }> = [];
  for (let pageNumber = startPage; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items
      .map((item) => ({
        str: 'str' in item ? item.str : '',
        height: 'height' in item && typeof item.height === 'number' ? item.height : 0,
      }))
      .filter((item) => item.str.trim().length > 0);
    pages.push({ pageNumber, items, itemCount: content.items.length });
  }
'''
nav = replace_or_assert(nav, old_pages, new_pages, 'structural navigation page extraction')

old_matches = '''    const exactPages = pages.filter((page) => page.exact.includes(key)).map((page) => page.pageNumber);
    const normalisedPages = pages.filter((page) => page.normalised.includes(normalisedKey)).map((page) => page.pageNumber);
    const strippedPages = pages.filter((page) => page.stripped.includes(strippedKey)).map((page) => page.pageNumber);
'''
new_matches = '''    // A tracked heading must be recoverable from a bounded run of heading-sized text items. This
    // rejects ordinary body prose even when it quotes the canonical section title verbatim, while
    // still accepting Chromium wrapping and inside-a-word text-item splits. The threshold sits
    // safely below the rendered h2 size and above report body/table copy.
    const MIN_HEADING_ITEM_HEIGHT = 12;
    const MAX_HEADING_ITEMS = 8;
    const structuralMatches = pages.map((page) => {
      let exact = false;
      let normalised = false;
      let stripped = false;
      for (let start = 0; start < page.items.length; start += 1) {
        if (page.items[start].height < MIN_HEADING_ITEM_HEIGHT) continue;
        const window: NavigationTextItem[] = [];
        for (let offset = 0; offset < MAX_HEADING_ITEMS && start + offset < page.items.length; offset += 1) {
          const item = page.items[start + offset];
          if (item.height < MIN_HEADING_ITEM_HEIGHT) break;
          window.push(item);
          const spaced = window.map((candidate) => candidate.str).join(' ');
          if (spaced === key) exact = true;
          if (normaliseWhitespace(spaced) === normalisedKey) normalised = true;
          if (stripWhitespace(spaced) === strippedKey) stripped = true;
        }
      }
      return { pageNumber: page.pageNumber, exact, normalised, stripped };
    });

    const exactPages = structuralMatches.filter((page) => page.exact).map((page) => page.pageNumber);
    const normalisedPages = structuralMatches.filter((page) => page.normalised).map((page) => page.pageNumber);
    const strippedPages = structuralMatches.filter((page) => page.stripped).map((page) => page.pageNumber);
'''
nav = replace_or_assert(nav, old_matches, new_matches, 'structural heading matching')
nav_path.write_text(nav)

regression_path = Path('scripts/commercial-quality/essential-v9-second-opinion-regression.mjs')
regression = regression_path.read_text()
old_regression = "assert.ok(template.includes('Management response:</strong> see Leadership decisions and roadmap'));"
new_regression = "assert.ok(template.includes('Management response:</strong> see the leadership roadmap section'));\nassert.doesNotMatch(template, /see Leadership decisions and roadmap/);"
regression = replace_or_assert(regression, old_regression, new_regression, 'governance cross-reference regression')

old_geometry_assert = "assert.match(template, /\\.score-basis-table th:nth-child\\(1\\).*width:58%/);"
new_geometry_assert = old_geometry_assert + "\nassert.match(template, /\\.section-kicker \\{[^}]*break-after: avoid; page-break-after: avoid; \\}/);\nassert.match(template, /\\.section-kicker \\+ h2 \\{ break-before: avoid; page-break-before: avoid; \\}/);"
regression = replace_or_assert(regression, old_geometry_assert, new_geometry_assert, 'section kicker heading regression')
regression_path.write_text(regression)

print('V9 navigation closure staged')

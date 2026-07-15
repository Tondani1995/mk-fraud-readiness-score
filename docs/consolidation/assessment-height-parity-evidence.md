# Assessment height parity evidence

## Scope and provenance

- Product source merged into consolidation: `60c2f5c9bebd294efd18c0ab1a8ddc0f4d89a748`.
- Public-website source ported into consolidation: `76c8a4cfc8b94c260f98111b853044f83675edf7`.
- Consolidated route: `/fraud-readiness-score#start-score`.
- Embedded route: `/score/start?embed=1` on the same origin.
- Viewports: desktop `1440 x 1000`; mobile `390 x 844`.

The browser fixture intercepts `POST /score/api/assessments/start` and returns a local HTTP 422 response. It therefore exercises the rendered validation-error state without sending the request to the application route or creating any database record. The taller state appends a local-only 720px block to the assessment form so that `ResizeObserver` and the parent `postMessage` listener are tested without starting a real assessment.

Run the repeatable check against a local or protected Preview base URL with:

```sh
CONSOLIDATION_BASE_URL=http://127.0.0.1:3100 node scripts/consolidation-assessment-height-browser.mjs
```

For a protected Preview, set the existing Vercel automation bypass value in `VERCEL_PROTECTION_BYPASS`; the value is never written to the evidence output.

## Machine-readable measurements

`heightDifferencePx` is `iframeRenderedHeightPx - embeddedContentScrollHeightPx`. A difference within two pixels accounts for browser subpixel rounding. `cardBottomToFooterStartPx` measures the parent-page distance between the embedded assessment card bottom and the website footer start.

```json
[
  {
    "viewport": "desktop",
    "viewportWidthPx": 1440,
    "viewportHeightPx": 1000,
    "state": "initial-form",
    "iframeRenderedHeightPx": 927,
    "embeddedContentScrollHeightPx": 927,
    "heightDifferencePx": 0,
    "cardBottomToFooterStartPx": 81,
    "internalVerticalScrollbar": false,
    "clipped": false,
    "outerPageScrollable": true
  },
  {
    "viewport": "desktop",
    "viewportWidthPx": 1440,
    "viewportHeightPx": 1000,
    "state": "validation-error",
    "iframeRenderedHeightPx": 997,
    "embeddedContentScrollHeightPx": 997,
    "heightDifferencePx": 0,
    "cardBottomToFooterStartPx": 81,
    "internalVerticalScrollbar": false,
    "clipped": false,
    "outerPageScrollable": true
  },
  {
    "viewport": "desktop",
    "viewportWidthPx": 1440,
    "viewportHeightPx": 1000,
    "state": "taller-state",
    "iframeRenderedHeightPx": 1741,
    "embeddedContentScrollHeightPx": 1741,
    "heightDifferencePx": 0,
    "cardBottomToFooterStartPx": 81,
    "internalVerticalScrollbar": false,
    "clipped": false,
    "outerPageScrollable": true
  },
  {
    "viewport": "mobile",
    "viewportWidthPx": 390,
    "viewportHeightPx": 844,
    "state": "initial-form",
    "iframeRenderedHeightPx": 1733,
    "embeddedContentScrollHeightPx": 1733,
    "heightDifferencePx": 0,
    "cardBottomToFooterStartPx": 57,
    "internalVerticalScrollbar": false,
    "clipped": false,
    "outerPageScrollable": true
  },
  {
    "viewport": "mobile",
    "viewportWidthPx": 390,
    "viewportHeightPx": 844,
    "state": "validation-error",
    "iframeRenderedHeightPx": 1843,
    "embeddedContentScrollHeightPx": 1843,
    "heightDifferencePx": 0,
    "cardBottomToFooterStartPx": 57,
    "internalVerticalScrollbar": false,
    "clipped": false,
    "outerPageScrollable": true
  },
  {
    "viewport": "mobile",
    "viewportWidthPx": 390,
    "viewportHeightPx": 844,
    "state": "taller-state",
    "iframeRenderedHeightPx": 2587,
    "embeddedContentScrollHeightPx": 2587,
    "heightDifferencePx": 0,
    "cardBottomToFooterStartPx": 57,
    "internalVerticalScrollbar": false,
    "clipped": false,
    "outerPageScrollable": true
  }
]
```

## Result

All six desktop/mobile states passed with no internal vertical scrollbar and no clipped assessment content. The iframe matched its embedded document height in every recorded state, while the expected outer-page scrollbar remained available for normal page scrolling. The fixed `1900px` height is not present in the implementation.

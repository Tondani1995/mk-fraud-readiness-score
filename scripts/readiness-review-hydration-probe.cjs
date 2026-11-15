// Hydration probe for the intermittent React error #418 ("server rendered HTML didn't match the client").
// node scripts/readiness-review-hydration-probe.cjs <baseUrl> <out.json> [loads=60] [role=management]
// Loads one role page of a fresh fictional session repeatedly and, for every load where React reports #418, records:
//  - the document state when React began discarding the server HTML, compared byte for byte with the HTML the server
//    sent (body markup, root attributes);
//  - the fiber React was completing when it threw, its ancestors and the DOM node it expected to claim. This uses a copy
//    of the production React chunk served only to this browser, with one recording call added at the throw. If the
//    hook point is not found in the build, the probe says so and records the rest.
// Production builds only report the error number, so this is how the location is found. The error appeared only with
// the processor busy; run it beside other work to reproduce it. All data is fictional.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [BASE = 'http://localhost:3200', OUT = 'hydration-probe.json', N = '60', ROLE = 'management'] = process.argv.slice(2);
const api = async (p, body) => (await fetch(BASE + p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined)).json();

// The production React DOM chunk: throwOnHydrationMismatch is the only function that builds error 418.
function findReactChunk(root) {
  const dir = path.join(root, '.next/static/chunks');
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    const m = text.match(/function ([A-Za-z_$][\w$]*)\(e\)\{var n=Error\([A-Za-z_$][\w$]*\(418,/);
    if (!m) continue;
    // The hydration cursor variables are declared just before it: var <parent>=null,<next>=null,...
    const before = text.slice(Math.max(0, m.index - 200), m.index);
    const vars = before.match(/var ([A-Za-z_$][\w$]*)=null,([A-Za-z_$][\w$]*)=null,[A-Za-z_$][\w$]*=!1/);
    return { file: f, text, fn: m[1], hook: m[0], parentVar: vars && vars[1], nextVar: vars && vars[2] };
  }
  return null;
}

(async () => {
  const chunk = findReactChunk(process.env.MK_BUILD_DIR || process.cwd());
  const s = await api('/review/api/sessions', { organisationLabel: 'Fictional Hydration Co', fictionalConfirmed: true });
  const links = (await api(`/review/api/s/${s.links}`)).view.tokens;
  const token = ROLE === 'links' ? s.links : ROLE === 'respondent' ? s.respondent : links[ROLE];
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let hooked = false;
  if (chunk && chunk.parentVar) {
    const patched = chunk.text.replace(chunk.hook, chunk.hook.replace('{var n=Error(', `{try{(window.__mkFibers=window.__mkFibers||[]).push(window.__mkDescribe(e,${chunk.nextVar},${chunk.parentVar}))}catch(x){};var n=Error(`));
    hooked = patched !== chunk.text;
    await ctx.route(`**/_next/static/chunks/${chunk.file}`, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: patched }));
  }
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const node = (n) => !n ? null : n.nodeType === 1 ? n.outerHTML.slice(0, 240) : n.nodeType === 8 ? `<!--${n.data}-->` : `#text:${JSON.stringify(String(n.textContent).slice(0, 80))}`;
    const fiber = (f) => {
      if (!f) return null;
      const t = f.type;
      const name = typeof t === 'string' ? t : t ? (t.displayName || t.name || typeof t) : `tag ${f.tag}`;
      const p = f.pendingProps && typeof f.pendingProps === 'object' ? f.pendingProps : {};
      return `${name} ${Object.keys(p).filter((k) => k !== 'children').slice(0, 6).map((k) => `${k}=${typeof p[k] === 'string' ? p[k].slice(0, 60) : typeof p[k]}`).join(' ')}`.trim();
    };
    window.__mkDescribe = (f, next) => {
      const chain = [];
      for (let x = f, k = 0; x && k < 12; x = x.return, k++) chain.push(fiber(x));
      return { readyState: document.readyState, fiber: fiber(f), expectedDomNode: node(next), ancestors: chain };
    };
    window.__mkAtDiscard = null;
    const removeChild = Node.prototype.removeChild;
    Node.prototype.removeChild = function (child) {
      if (!window.__mkAtDiscard && this === document.head) window.__mkAtDiscard = { readyState: document.readyState, body: document.body.innerHTML, html: [...document.documentElement.attributes].map((a) => `${a.name}=${a.value}`).join(' '), bodyAttrs: [...document.body.attributes].map((a) => `${a.name}=${a.value}`).join(' ') };
      return removeChild.call(this, child);
    };
  });
  const failures = [];
  for (let i = 0; i < Number(N); i++) {
    let error = null;
    const onError = (e) => { if (/Minified React error #418|Hydration failed/.test(String(e))) error = String(e).slice(0, 160); };
    page.on('pageerror', onError);
    const res = await page.goto(`${BASE}/review/s/${token}`, { waitUntil: 'networkidle' });
    const html = await res.text();
    page.off('pageerror', onError);
    if (!error) continue;
    const detail = await page.evaluate((serverHtml) => {
      const doc = new DOMParser().parseFromString(serverHtml, 'text/html');
      const at = window.__mkAtDiscard;
      const sent = doc.body.innerHTML;
      return {
        bodyAtDiscardEqualsServerHtml: at ? at.body === sent : null,
        rootAttributesEqual: at ? at.html === [...doc.documentElement.attributes].map((a) => `${a.name}=${a.value}`).join(' ') && at.bodyAttrs === [...doc.body.attributes].map((a) => `${a.name}=${a.value}`).join(' ') : null,
        readyStateAtDiscard: at && at.readyState,
        fibers: window.__mkFibers || []
      };
    }, html);
    failures.push({ load: i, error, ...detail });
  }
  await browser.close();
  const result = { base: BASE, role: ROLE, loads: Number(N), errors418: failures.length, reactChunkHooked: hooked, failures };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
  console.log(JSON.stringify({ role: ROLE, loads: Number(N), errors418: failures.length, reactChunkHooked: hooked }));
})();

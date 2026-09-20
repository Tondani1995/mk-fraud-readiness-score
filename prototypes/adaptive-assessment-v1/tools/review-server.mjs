#!/usr/bin/env node
/**
 * Zero-dependency local review server for the MK adaptive assessment prototype.
 *   npm run review
 *
 * PROTOTYPE ONLY. Serves static files from this directory on localhost.
 * No production route, no backend, no network egress.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, normalize, resolve, extname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const PORT = Number(process.env.PORT || 8899);
const HOST = '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';

    // Contain every request inside ROOT.
    const target = resolve(ROOT, `.${normalize(pathname)}`);
    if (!target.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    // Read directly rather than stat-then-read: checking existence first and acting on
    // the result afterwards is a time-of-check/time-of-use race. A single read that
    // handles its own failure is both correct and simpler.
    let body;
    try {
      body = await readFile(target);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': TYPES[extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow'
    }).end(body);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(String(error));
  }
});

server.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}/index.html`;
  const line = '─'.repeat(74);
  process.stdout.write(`
${line}
  MK ADAPTIVE FRAUD READINESS ASSESSMENT — LOCAL REVIEW
${line}

  Open this URL in your browser:

      ${url}

  THIS IS A PROTOTYPE. It is not connected to Production.
    · No Supabase, no live API, no payments, no email, no report generation.
    · Answers are stored only in this browser's localStorage.
    · No personal information is collected. All organisations are synthetic.
    · The score shown is illustrative and is not a score of record.

  HOW TO REVIEW IT
    1. Switch synthetic organisation
       Use the "Synthetic journey" dropdown in the grey bar at the bottom.
       J1 professional services · J2 retail · J3 construction · J4 online
       J5 small business · J6 low certainty · J7 excluded weak domain
       J8 high unknown / high apparent maturity
       Selecting one pre-fills its profile answers and drops you at the
       first control question.

    2. Inspect the branching path
       Click "Inspect branching path". It prints the ordered active path, every
       excluded control with its reason code, every outsourcing redirect, the
       audit history, and the live coverage / visibility / score figures.

    3. Trigger a save failure
       Click "Simulate save failure", then answer a question. You will see the
       save-failed state and the retry path. Click it again to switch off, then
       press "Retry save" to recover.

    4. Reset the prototype
       Click "Reset state" in the grey bar, or clear localStorage.

    5. See the report preview
       Complete a journey (or load J7 / J8) and reach the final review screen to
       see the Fraud Readiness Score, Assessment Coverage, Control Visibility,
       report status, assessed-scope schedule and grouped recommendations.

  Press Ctrl+C to stop.
${line}

`);
});

process.on('SIGINT', () => {
  process.stdout.write('\n  Review server stopped.\n\n');
  server.close(() => process.exit(0));
});

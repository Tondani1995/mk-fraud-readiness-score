/**
 * MK Adaptive Fraud Readiness Assessment — prototype UI.
 *
 * PROTOTYPE ONLY.
 *  - No production endpoints. Persistence is localStorage, simulated latency.
 *  - No personal information is collected. Organisation names are synthetic.
 *  - No AI at runtime: every branching decision comes from question-graph.json
 *    via the pure engine in engine.js.
 */

import { AssessmentGraph, whyAsking } from './engine.js';
import { JOURNEYS, RESPONDERS } from './journeys.js';
import { buildAssessment } from './assessment-model.js';
import { reviewScreenHtml } from './review-screen.js';

const STORAGE_KEY = 'mk-adaptive-assessment-prototype-v1';
const SAVE_LATENCY_MS = 420;

const el = {
  stage: document.getElementById('stage'),
  main: document.getElementById('main'),
  progress: document.getElementById('progress'),
  progressArea: document.getElementById('progress-area'),
  progressTime: document.getElementById('progress-time'),
  progressBar: document.getElementById('progress-bar'),
  progressFill: document.getElementById('progress-fill'),
  savebar: document.getElementById('savebar'),
  savebarText: document.getElementById('savebar-text'),
  srStatus: document.getElementById('sr-status'),
  srAlert: document.getElementById('sr-alert'),
  dialogRoot: document.getElementById('dialog-root'),
  journeySelect: document.getElementById('journey-select'),
  pathdump: document.getElementById('pathdump')
};

let graph;
let state;
let simulateSaveFailure = false;
let lastAssessment = null;   // most recent buildAssessment(), exposed for tests

/* ------------------------------------------------------------------- state */

function blankState() {
  return {
    screen: 'welcome',          // welcome | question | domain-complete | review | submitted
    answers: {},
    auditHistory: [],
    currentId: null,
    visited: [],                // ordered ids the respondent has actually seen
    journeyId: null,
    organisationName: 'Your organisation',
    saveState: 'idle',
    lastSavedAt: null,
    submittedAt: null
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return blankState();
    const parsed = JSON.parse(raw);
    return { ...blankState(), ...parsed };
  } catch {
    return blankState();
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** Simulated save with visible in-progress and failure states. */
function save({ silent = false } = {}) {
  if (!silent) setSaveState('saving');
  return new Promise((resolve) => {
    setTimeout(() => {
      if (simulateSaveFailure) {
        setSaveState('error');
        resolve(false);
        return;
      }
      const ok = persist();
      state.lastSavedAt = new Date().toISOString();
      setSaveState(ok ? 'saved' : 'error');
      resolve(ok);
    }, SAVE_LATENCY_MS);
  });
}

function setSaveState(next) {
  state.saveState = next;
  el.savebar.hidden = state.screen === 'welcome';
  el.savebar.dataset.state = next;
  const text = {
    idle: 'Your progress saves automatically',
    saving: 'Saving your answer…',
    saved: state.lastSavedAt
      ? `All answers saved · ${new Date(state.lastSavedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}`
      : 'All answers saved',
    error: 'Not saved. Your answer is safe on this device — retry below.'
  }[next];
  el.savebarText.textContent = text;
  if (next === 'error') announce(text, true);
}

function announce(message, assertive = false) {
  const target = assertive ? el.srAlert : el.srStatus;
  target.textContent = '';
  window.setTimeout(() => { target.textContent = message; }, 40);
}

/* ---------------------------------------------------------------- progress */

function renderProgress() {
  if (state.screen === 'welcome') { el.progress.hidden = true; return; }
  el.progress.hidden = false;

  const p = graph.progress(state.answers);
  const node = state.currentId ? graph.get(state.currentId) : null;
  const areaName = state.screen === 'review'
    ? 'Final review'
    : node
      ? (node.domain === 'PROFILE' ? 'Organisation profile' : (graph.domainByCode.get(node.domain) || {}).name)
      : 'Assessment';

  el.progressArea.textContent = `${areaName} · ${p.areasComplete} of ${p.areasTotal} areas done`;
  el.progressTime.textContent = state.screen === 'review'
    ? 'Almost there'
    : `About ${p.minutesRemaining} min left`;

  el.progressBar.setAttribute('aria-valuenow', String(p.overallPct));
  el.progressBar.setAttribute('aria-valuetext',
    `${p.overallPct} percent complete. ${areaName}. About ${p.minutesRemaining} minutes remaining.`);
  el.progressFill.style.width = `${p.overallPct}%`;
}

/* ------------------------------------------------------------------ render */

function render() {
  const screens = {
    welcome: renderWelcome,
    resume: renderResume,
    question: renderQuestion,
    'domain-complete': renderDomainComplete,
    review: renderReview,
    submitted: renderSubmitted
  };
  (screens[state.screen] || renderWelcome)();
  renderProgress();
  el.savebar.hidden = state.screen === 'welcome';
}

// Moving focus to the new heading is correct for in-app screen changes, but on
// the very first paint it would jump past the skip link and rob keyboard and
// screen-reader users of it. So the first render leaves focus at the document top.
let firstRenderDone = false;

function setStage(html, { focus = 'h1' } = {}) {
  el.stage.innerHTML = html;
  el.stage.firstElementChild?.classList.add('animate-in');
  const target = el.stage.querySelector(focus) || el.stage.querySelector('h1, h2');
  if (target) {
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    if (firstRenderDone) target.focus({ preventScroll: true });
  }
  firstRenderDone = true;
  window.scrollTo({ top: 0, behavior: 'auto' });
}

/* --------------------------------------------------------------- 1. welcome */

function renderWelcome() {
  const hasSaved = Object.keys(state.answers).length > 0;
  setStage(`
    <section aria-labelledby="welcome-title">
      <p class="eyebrow"><span class="eyebrow__dot" aria-hidden="true"></span>Fraud Readiness Assessment</p>
      <h1 id="welcome-title" class="question__prompt" style="font-size:var(--step-3)">
        A structured conversation about how fraud could reach your organisation.
      </h1>
      <p class="question__guidance">
        We ask one question at a time, and we only ask what applies to how you actually
        operate. If you tell us an activity does not exist, we will not ask you about it.
      </p>

      <div class="statgrid">
        <div class="stat"><div class="stat__value">10</div><div class="stat__label">Risk areas assessed</div></div>
        <div class="stat"><div class="stat__value">~25–45</div><div class="stat__label">Minutes, depending on your profile</div></div>
        <div class="stat"><div class="stat__value">Any time</div><div class="stat__label">Pause and resume</div></div>
        <div class="stat"><div class="stat__value">Private</div><div class="stat__label">No personal details required</div></div>
      </div>

      <div class="callout callout--info">
        <span class="callout__icon" aria-hidden="true">i</span>
        <span>
          Answer as things genuinely are today, not as they should be. If you do not know how
          something is controlled, say so — that is useful information, and it is treated
          differently from a control being absent.
        </span>
      </div>

      <div class="callout callout--warn">
        <span class="callout__icon" aria-hidden="true">!</span>
        <span><strong>Prototype.</strong> This is a design prototype for evaluation. It stores answers only in this
        browser, connects to no live system, and produces no report or score of record.</span>
      </div>

      <div class="actions">
        ${hasSaved ? `
          <button class="btn btn--primary" data-action="resume">Continue where you left off</button>
          <button class="btn btn--ghost" data-action="restart">Start again</button>
        ` : `
          <button class="btn btn--primary" data-action="begin">Begin assessment</button>
        `}
      </div>
    </section>
  `);
}

/* -------------------------------------------------------------- 12. resume */

function renderResume() {
  const p = graph.progress(state.answers);
  const node = state.currentId ? graph.get(state.currentId) : null;
  setStage(`
    <section aria-labelledby="resume-title">
      <p class="eyebrow"><span class="eyebrow__dot" aria-hidden="true"></span>Welcome back</p>
      <h1 id="resume-title" class="question__prompt">Your assessment is exactly where you left it.</h1>
      <p class="question__guidance">
        Nothing was lost. We saved every answer on this device as you went.
      </p>
      <div class="statgrid">
        <div class="stat"><div class="stat__value">${p.answered}</div><div class="stat__label">Questions answered</div></div>
        <div class="stat"><div class="stat__value">${p.areasComplete}/${p.areasTotal}</div><div class="stat__label">Areas complete</div></div>
        <div class="stat"><div class="stat__value">${p.overallPct}%</div><div class="stat__label">Overall progress</div></div>
        <div class="stat"><div class="stat__value">~${p.minutesRemaining}</div><div class="stat__label">Minutes remaining</div></div>
      </div>
      ${node ? `<div class="callout callout--info">
        <span class="callout__icon" aria-hidden="true">→</span>
        <span>You were on <strong>${escapeHtml(node.section || 'the assessment')}</strong>. We will take you back to that exact question.</span>
      </div>` : ''}
      <div class="actions">
        <button class="btn btn--primary" data-action="resume-continue">Continue</button>
        <button class="btn btn--ghost" data-action="review">Review answers so far</button>
      </div>
    </section>
  `);
}

/* ------------------------------------- 3-9, 17-18. one question at a time */

function renderQuestion() {
  const node = graph.get(state.currentId);
  if (!node) { goToNext(); return; }

  const isGateway = node.gateway_status === 'gateway';
  const isVariant = node.gateway_status === 'oversight_variant';
  const areaName = node.domain === 'PROFILE'
    ? node.section
    : (graph.domainByCode.get(node.domain) || {}).name;

  const why = whyAsking(graph, node, state.answers);
  const current = state.answers[state.currentId]?.value;

  // Progressive profiling: show the block intro on the first gateway of a block.
  const block = isGateway ? graph.graph.gateway_blocks.find((b) => b.phase === node.phase) : null;
  const firstOfBlock = block && graph.gateways
    .filter((g) => g.phase === node.phase)
    .findIndex((g) => g.question_id === node.question_id) === 0;

  const options = isGateway
    ? node.response_options.map((o) => optionHtml(o.value, o.label, null, current, o.value === 'unknown'))
    : [
        ...graph.graph.response_scale.map((s) =>
          optionHtml(s.responseValue, s.label, s.operationalMeaning, current, false)),
        optionHtml('unknown', graph.graph.uncertainty_option.label,
          graph.graph.uncertainty_option.helper, current, true)
      ];

  // Auto-advance is allowed only for low-impact single-selects (6.4).
  const autoAdvance = isGateway ? node.auto_advance === true && !node.high_impact : true;

  const canGoBack = state.visited.length > 1;

  setStage(`
    <section aria-labelledby="q-title">
      <p class="eyebrow">
        <span class="eyebrow__dot" aria-hidden="true"></span>
        ${escapeHtml(areaName)}
        ${isGateway ? '<span class="proto-flag">Sets what we ask next</span>' : ''}
        ${isVariant ? '<span class="proto-flag">Third-party oversight</span>' : ''}
      </p>

      ${firstOfBlock ? `
        <div class="blockintro" data-testid="gateway-block-intro">
          <span class="blockintro__title">${escapeHtml(block.title)}</span>
          ${escapeHtml(block.intro)}
        </div>` : ''}

      <h1 id="q-title" class="question__prompt">${escapeHtml(node.prompt)}</h1>

      ${node.display_guidance ? `<p class="question__guidance">${escapeHtml(node.display_guidance)}</p>` : ''}

      ${why ? `<div class="why"><span class="why__label">Why we are asking</span>${escapeHtml(why)}</div>` : ''}

      <div id="q-error" role="alert"></div>

      <fieldset style="border:0;padding:0;margin:0">
        <legend class="visually-hidden">${escapeHtml(node.prompt)}</legend>
        <div class="options" role="radiogroup" aria-labelledby="q-title" aria-describedby="${node.evidence_prompt ? 'q-evidence' : ''}">
          ${options.join('')}
        </div>
      </fieldset>

      ${node.evidence_prompt ? `
        <p id="q-evidence" class="question__guidance" style="font-size:0.8125rem">
          <strong>Typical evidence:</strong> ${escapeHtml(node.evidence_prompt)}
        </p>` : ''}

      ${node.small_org_note ? `
        <div class="callout callout--info">
          <span class="callout__icon" aria-hidden="true">i</span>
          <span>${escapeHtml(node.small_org_note)}</span>
        </div>` : ''}

      <div class="actions">
        ${canGoBack ? '<button class="btn btn--ghost" data-action="back">Back</button>' : ''}
        <div class="actions__spacer"></div>
        ${state.saveState === 'error'
          ? '<button class="btn btn--danger" data-action="retry-save">Retry save</button>'
          : `<button class="btn btn--primary" data-action="continue" ${autoAdvance ? 'data-autoadvance="true"' : ''} ${current === undefined ? 'disabled' : ''}>Continue</button>`}
      </div>
    </section>
  `);

  // Wire option selection
  el.stage.querySelectorAll('input[name="answer"]').forEach((input) => {
    input.addEventListener('change', () => onSelect(input.value, autoAdvance));
  });
}

function optionHtml(value, label, meaning, current, isUnknown) {
  const id = `opt-${String(value).replace(/[^a-z0-9]/gi, '')}`;
  const checked = String(current) === String(value) ? 'checked' : '';
  return `
    <label class="option ${isUnknown ? 'option--unknown' : ''}" for="${id}">
      <input type="radio" id="${id}" name="answer" value="${escapeAttr(value)}" ${checked} />
      <span class="option__marker" aria-hidden="true"></span>
      <span class="option__body">
        <span class="option__label">${escapeHtml(label)}</span>
        ${meaning ? `<span class="option__meaning">${escapeHtml(meaning)}</span>` : ''}
      </span>
    </label>
  `;
}

async function onSelect(rawValue, autoAdvance) {
  const node = graph.get(state.currentId);
  const value = /^\d+$/.test(rawValue) ? Number(rawValue) : rawValue;

  // 14. Changing a gateway that invalidates downstream answers requires confirmation.
  const existing = state.answers[state.currentId]?.value;
  if (node.gateway_status === 'gateway' && existing !== undefined && existing !== value) {
    const preview = graph.invalidationPreview(state.answers, state.currentId, value);
    if (preview.invalidatedCount > 0) {
      const confirmed = await confirmInvalidation(preview, node);
      if (!confirmed) { render(); return; }
      preview.invalidatedIds.forEach((id) => {
        state.auditHistory.push({
          event: 'invalidated', question_id: id,
          previous_value: state.answers[id].value,
          cause: state.currentId, at: new Date().toISOString()
        });
        delete state.answers[id];
      });
      state.visited = state.visited.filter((id) => !preview.invalidatedIds.includes(id));
      announce(`${preview.invalidatedCount} answers removed because they no longer apply.`, true);
    }
  }

  state.answers[state.currentId] = { value, answeredAt: new Date().toISOString() };
  clearError();
  renderProgress();

  const ok = await save();
  if (!ok) { render(); return; }

  if (autoAdvance) {
    goToNext();
  } else {
    // 8. Manual continue: enable the button, keep focus discoverable.
    const btn = el.stage.querySelector('[data-action="continue"]');
    if (btn) btn.disabled = false;
    announce('Answer recorded. Select Continue when you are ready.');
  }
}

/* ------------------------------------------------------- 13/14. dialogs */

function confirmInvalidation(preview, gatewayNode) {
  return new Promise((resolve) => {
    const names = preview.invalidatedIds.slice(0, 5).map((id) => {
      const q = graph.get(id);
      return `<li>${escapeHtml(truncate(q?.prompt || id, 90))}</li>`;
    }).join('');
    const more = preview.invalidatedCount > 5 ? `<li>…and ${preview.invalidatedCount - 5} more</li>` : '';

    openDialog({
      title: `Changing this will remove ${preview.invalidatedCount} answer${preview.invalidatedCount === 1 ? '' : 's'}`,
      body: `Because you are changing <strong>${escapeHtml(truncate(gatewayNode.prompt, 70))}</strong>,
             the following answers no longer apply to your organisation and will be removed from the
             assessment. They are kept in the audit history but will not affect your result.
             ${preview.newlyApplicableCount > 0 ? `<br><br>We will also ask you <strong>${preview.newlyApplicableCount}</strong> new question${preview.newlyApplicableCount === 1 ? '' : 's'} that now apply.` : ''}`,
      list: names + more,
      confirmLabel: 'Change my answer',
      cancelLabel: 'Keep my original answer',
      danger: true
    }, resolve);
  });
}

function openDialog({ title, body, list, confirmLabel, cancelLabel, danger }, resolve) {
  const previouslyFocused = document.activeElement;
  el.dialogRoot.innerHTML = `
    <div class="dialog-backdrop" data-dialog-backdrop>
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-body">
        <h2 class="dialog__title" id="dlg-title" tabindex="-1">${title}</h2>
        <p class="dialog__body" id="dlg-body">${body}</p>
        ${list ? `<ul class="dialog__list">${list}</ul>` : ''}
        <div class="actions">
          <button class="btn btn--ghost" data-dialog="cancel">${escapeHtml(cancelLabel)}</button>
          <div class="actions__spacer"></div>
          <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-dialog="confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    </div>`;

  const backdrop = el.dialogRoot.querySelector('[data-dialog-backdrop]');
  const dialog = backdrop.querySelector('.dialog');
  dialog.querySelector('#dlg-title').focus();

  const focusables = () => [...dialog.querySelectorAll('button')];

  const close = (result) => {
    document.removeEventListener('keydown', onKey, true);
    el.dialogRoot.innerHTML = '';
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus({ preventScroll: true });
    resolve(result);
  };

  function onKey(event) {
    if (event.key === 'Escape') { event.preventDefault(); close(false); return; }
    if (event.key !== 'Tab') return;
    // Focus trap
    const items = focusables();
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', onKey, true);

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close(false);
  });
  dialog.querySelector('[data-dialog="cancel"]').addEventListener('click', () => close(false));
  dialog.querySelector('[data-dialog="confirm"]').addEventListener('click', () => close(true));
}

/* ----------------------------------------------- 16. domain-complete state */

function renderDomainComplete(domainCode) {
  const code = domainCode || state.pendingDomainComplete;
  const domain = graph.domainByCode.get(code);
  const p = graph.progress(state.answers);
  setStage(`
    <section aria-labelledby="dc-title">
      <p class="eyebrow"><span class="eyebrow__dot" aria-hidden="true"></span>Area complete</p>
      <h1 id="dc-title" class="question__prompt">${escapeHtml(domain ? domain.name : 'Section')} is done.</h1>
      <p class="question__guidance">
        ${p.areasComplete} of ${p.areasTotal} areas complete. About ${p.minutesRemaining} minutes remain,
        based on the areas that apply to your organisation.
      </p>
      <div class="actions">
        <button class="btn btn--primary" data-action="continue-domain">Continue</button>
        <button class="btn btn--quiet" data-action="pause">Save and finish later</button>
      </div>
    </section>
  `);
}

/* ------------------------------------------------- 19-20. final review */

/* ------------------------------------------------- 19-20. final review */

function renderReview() {
  const result = buildAssessment(graph, state.answers, state.auditHistory);
  const { active } = graph.resolvePath(state.answers);

  const scoredActive = active.filter((n) => n.node.gateway_status !== 'gateway');
  const decorate = (n) => ({
    id: n.id,
    node: n.node,
    domainName: (graph.domainByCode.get(n.node.domain) || {}).name || ''
  });
  const unansweredNodes = scoredActive
    .filter((n) => state.answers[n.id]?.value === undefined).map(decorate);
  const unknownNodes = scoredActive
    .filter((n) => state.answers[n.id]?.value === 'unknown').map(decorate);

  lastAssessment = result;

  setStage(reviewScreenHtml(result, {
    escapeHtml, escapeAttr, truncate, unansweredNodes, unknownNodes
  }));
}


/* ------------------------------------------------- 21. submission confirmed */

function renderSubmitted() {
  const result = buildAssessment(graph, state.answers, state.auditHistory);
  lastAssessment = result;
  setStage(`
    <section aria-labelledby="done-title">
      <p class="eyebrow"><span class="eyebrow__dot" aria-hidden="true"></span>Submitted</p>
      <h1 id="done-title" class="question__prompt">Thank you. Your assessment is complete.</h1>
      <p class="question__guidance">
        We have everything we need. Your Essential Self-Assessment Report will be prepared from
        these answers and the assessed-scope schedule below.
      </p>
      <div class="statgrid">
        <div class="stat"><div class="stat__value">${result.counts.applicable}</div><div class="stat__label">Controls assessed</div></div>
        <div class="stat"><div class="stat__value">${result.counts.excluded}</div><div class="stat__label">Excluded as not applicable</div></div>
        <div class="stat"><div class="stat__value">${result.assessmentCoverage}%</div><div class="stat__label">Assessment coverage</div></div>
        <div class="stat"><div class="stat__value">${result.controlVisibility}%</div><div class="stat__label">Control visibility</div></div>
      </div>
      ${!result.scoreIssued ? `
      <div class="callout callout--warn" data-testid="submitted-score-withheld">
        <span class="callout__icon" aria-hidden="true">!</span>
        <span>${escapeHtml(result.scoreWithheldReason)}</span>
      </div>` : ''}
      <div class="callout callout--info">
        <span class="callout__icon" aria-hidden="true">i</span>
        <span>${escapeHtml(result.comparabilityStatement)}</span>
      </div>
      <div class="callout callout--success">
        <span class="callout__icon" aria-hidden="true">✓</span>
        <span>Reference <strong>MK-PROTO-${String(Date.now()).slice(-6)}</strong> · submitted ${new Date(state.submittedAt || Date.now()).toLocaleString('en-ZA')}</span>
      </div>
      <div class="callout callout--warn">
        <span class="callout__icon" aria-hidden="true">!</span>
        <span><strong>Prototype.</strong> Nothing was sent anywhere. No report will be generated and no
        payment is taken.</span>
      </div>
      <div class="actions">
        <button class="btn btn--ghost" data-action="reset">Reset prototype</button>
      </div>
    </section>
  `);
}

/* -------------------------------------------------------------- navigation */

function goToNext() {
  const previous = state.currentId ? graph.get(state.currentId) : null;
  const next = graph.nextUnanswered(state.answers, state.currentId);

  if (!next) {
    state.screen = 'review';
    state.currentId = null;
    save({ silent: true });
    render();
    announce('All questions complete. Final review.');
    return;
  }

  // 16. Domain-complete transition when the area changes (and the old one is finished).
  if (previous && previous.domain !== next.node.domain && previous.domain !== 'PROFILE') {
    const p = graph.progress(state.answers);
    const finished = p.areas.find((a) => a.code === previous.domain);
    if (finished && finished.complete) {
      state.pendingDomainComplete = previous.domain;
      state.nextAfterDomain = next.id;
      state.screen = 'domain-complete';
      render();
      return;
    }
  }

  state.currentId = next.id;
  if (!state.visited.includes(next.id)) state.visited.push(next.id);
  state.screen = 'question';
  // Navigation is part of resumable state: without this, a refresh returns the
  // respondent to the previously-saved question rather than the active one.
  persist();
  render();
}

function goBack() {
  const index = state.visited.indexOf(state.currentId);
  const targetIndex = index > 0 ? index - 1 : state.visited.length - 2;
  const target = state.visited[targetIndex];
  if (!target) return;
  state.currentId = target;
  state.screen = 'question';
  persist();
  render();
  announce('Returned to your previous answer. Changing it may affect later questions.');
}

function jumpTo(id) {
  state.currentId = id;
  if (!state.visited.includes(id)) state.visited.push(id);
  state.screen = 'question';
  persist();
  render();
}

/* ------------------------------------------------------------ 9. validation */

function showError(message) {
  const box = el.stage.querySelector('#q-error');
  if (!box) return;
  box.innerHTML = `<div class="callout callout--error">
    <span class="callout__icon" aria-hidden="true">!</span><span>${escapeHtml(message)}</span></div>`;
  announce(message, true);
  const firstOption = el.stage.querySelector('input[name="answer"]');
  firstOption?.focus();
}

function clearError() {
  const box = el.stage.querySelector('#q-error');
  if (box) box.innerHTML = '';
}

/* ---------------------------------------------------------------- actions */

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;

  if (action === 'begin') {
    state.screen = 'question';
    goToNext();
    await save({ silent: true });
  }

  if (action === 'resume') { state.screen = 'resume'; render(); }

  if (action === 'resume-continue') {
    state.screen = state.currentId ? 'question' : 'review';
    if (!state.currentId) goToNext(); else render();
  }

  if (action === 'restart') { resetAll(); }

  if (action === 'continue') {
    const value = state.answers[state.currentId]?.value;
    if (value === undefined) { showError('Select one of the options to continue.'); return; }
    goToNext();
  }

  if (action === 'continue-domain') {
    state.screen = 'question';
    state.currentId = state.nextAfterDomain || state.currentId;
    if (state.currentId && !state.visited.includes(state.currentId)) state.visited.push(state.currentId);
    state.pendingDomainComplete = null;
    render();
  }

  if (action === 'back') goBack();
  if (action === 'back-to-questions') {
    const next = graph.nextUnanswered(state.answers) || { id: state.visited[state.visited.length - 1] };
    if (next?.id) jumpTo(next.id);
  }
  if (action === 'jump') jumpTo(button.dataset.id);
  if (action === 'review') { state.screen = 'review'; render(); }

  if (action === 'pause') {
    await save();
    state.screen = 'welcome';
    render();
    announce('Progress saved. You can close this page and return later.');
  }

  if (action === 'retry-save') {
    simulateSaveFailure = false;
    const ok = await save();
    if (ok) { announce('Saved successfully.'); goToNext(); }
  }

  if (action === 'submit') {
    state.submittedAt = new Date().toISOString();
    state.screen = 'submitted';
    await save({ silent: true });
    render();
    announce('Assessment submitted.');
  }

  if (action === 'reset') resetAll();
});

/* Keyboard: 1-6 select maturity, U selects unknown, Enter continues. */
document.addEventListener('keydown', (event) => {
  if (state.screen !== 'question') return;
  if (event.target.matches('input, textarea, select')) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  const inputs = [...el.stage.querySelectorAll('input[name="answer"]')];
  if (inputs.length === 0) return;

  if (/^[1-9]$/.test(event.key)) {
    const index = Number(event.key) - 1;
    if (inputs[index]) { event.preventDefault(); inputs[index].focus(); inputs[index].click(); }
  }
  if (event.key.toLowerCase() === 'u') {
    const unknown = inputs.find((i) => i.value === 'unknown');
    if (unknown) { event.preventDefault(); unknown.focus(); unknown.click(); }
  }
});

/* -------------------------------------------------------------- dev panel */

function resetAll() {
  localStorage.removeItem(STORAGE_KEY);
  state = blankState();
  simulateSaveFailure = false;
  el.journeySelect.value = '';
  el.pathdump.hidden = true;
  render();
  announce('Prototype state reset.');
}

function loadJourney(journeyId) {
  const journey = JOURNEYS.find((j) => j.id === journeyId);
  if (!journey) return;
  state = blankState();
  state.journeyId = journey.id;
  state.organisationName = journey.organisationName;
  Object.entries(journey.gateways).forEach(([id, value]) => {
    state.answers[id] = { value, answeredAt: new Date().toISOString() };
  });
  state.visited = Object.keys(journey.gateways);
  state.screen = 'question';
  goToNext();
  persist();
  announce(`Loaded synthetic journey: ${journey.name}. Gateway answers pre-filled.`);
}

function dumpPath() {
  const { active, excluded, redirected } = graph.resolvePath(state.answers);
  const p = graph.progress(state.answers);
  const profile = graph.applicabilityProfile(state.answers, state.auditHistory);
  const lines = [
    `GRAPH  ${graph.graph.graph_version}   METHODOLOGY ${graph.graph.methodology_version}`,
    `ACTIVE ${active.length}   EXCLUDED ${excluded.length}   REDIRECTED ${redirected.length}   INVALIDATED ${state.auditHistory.filter((h) => h.event === 'invalidated').length}`,
    `PROGRESS ${p.overallPct}%   AREAS ${p.areasComplete}/${p.areasTotal}   EST ${p.minutesRemaining} min`,
    `COVERAGE ${profile.coveragePct}%   UNKNOWN SHARE ${profile.unknownWeightShare}%   PROVISIONAL ${profile.provisionalScore}`,
    '',
    '── ACTIVE PATH ──',
    ...active.map((n, i) => {
      const a = state.answers[n.id];
      const mark = n.id === state.currentId ? '▶' : (a?.value !== undefined ? '·' : ' ');
      return `${mark} ${String(i + 1).padStart(2)} ${n.id.padEnd(10)} ${n.kind.padEnd(17)} ${a?.value !== undefined ? `= ${a.value}` : ''}${n.replaces ? `  (replaces ${n.replaces})` : ''}`;
    }),
    '',
    '── EXCLUDED ──',
    ...(excluded.length ? excluded.map((e) => `  ${e.id.padEnd(10)} ${e.skip_reason_code}`) : ['  (none)']),
    '',
    '── REDIRECTED (outsourced) ──',
    ...(redirected.length ? redirected.map((r) => `  ${r.from} → ${r.to}`) : ['  (none)']),
    '',
    '── AUDIT HISTORY ──',
    ...(state.auditHistory.length
      ? state.auditHistory.map((h) => `  ${h.event} ${h.question_id} (was ${h.previous_value}, cause ${h.cause})`)
      : ['  (none)'])
  ];
  el.pathdump.textContent = lines.join('\n');
  el.pathdump.hidden = false;
}

/* ----------------------------------------------------------------- startup */

async function boot() {
  const response = await fetch('data/question-graph.json');
  graph = new AssessmentGraph(await response.json());

  state = loadState();

  // 12. Resume: if there is saved work, offer resume rather than silently continuing.
  if (Object.keys(state.answers).length > 0 && state.screen !== 'submitted') {
    state.screen = state.screen === 'welcome' ? 'welcome' : 'resume';
  }

  JOURNEYS.forEach((j) => {
    const option = document.createElement('option');
    option.value = j.id;
    // Kept short: a <select> sizes to its longest option and would otherwise
    // overflow a 320px viewport.
    option.textContent = `${j.id} — ${truncate(j.name, 34)}`;
    option.title = j.name;
    el.journeySelect.append(option);
  });
  el.journeySelect.value = state.journeyId || '';

  el.journeySelect.addEventListener('change', (e) => {
    if (e.target.value) loadJourney(e.target.value);
  });
  document.getElementById('btn-path').addEventListener('click', dumpPath);
  document.getElementById('btn-reset').addEventListener('click', resetAll);
  document.getElementById('btn-simulate-fail').addEventListener('click', () => {
    simulateSaveFailure = !simulateSaveFailure;
    document.getElementById('btn-simulate-fail').textContent =
      simulateSaveFailure ? 'Save failure: ON' : 'Simulate save failure';
    announce(simulateSaveFailure ? 'Save failure simulation enabled.' : 'Save failure simulation disabled.');
  });

  render();
}

/* ------------------------------------------------------------------ utils */

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(value) { return escapeHtml(value); }
function truncate(value, max) {
  const s = String(value);
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

// Expose for browser-level tests only. No production coupling.
window.__MK_PROTO__ = {
  getState: () => state,
  getGraph: () => graph,
  getAssessment: () => buildAssessment(graph, state.answers, state.auditHistory),
  getLastAssessment: () => lastAssessment,
  loadJourney,
  reset: resetAll,
  responders: RESPONDERS,
  journeys: JOURNEYS
};

boot();

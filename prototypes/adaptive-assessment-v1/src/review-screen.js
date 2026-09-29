/**
 * Final review / report-preview screen.
 * PROTOTYPE ONLY.
 *
 * Presents the three measures separately (Fraud Readiness Score, Assessment
 * Coverage, Control Visibility), the report status, the assessed-scope schedule
 * with reasons, and recommendations grouped by class.
 *
 * It must never imply that a reduced-scope result is comparable with a full-scope
 * one, and must never show a recommendation for an excluded control.
 */

import { REPORT_STATUS } from './assessment-model.js';

const STATUS_COPY = {
  [REPORT_STATUS.NORMAL]: {
    label: 'Normal',
    tone: 'success',
    blurb: 'Coverage and control visibility are sufficient for a full conclusion.'
  },
  [REPORT_STATUS.PROVISIONAL]: {
    label: 'Provisional',
    tone: 'warn',
    blurb: 'A score can be shown, but the conclusion is limited. The reasons are listed below.'
  },
  [REPORT_STATUS.INSUFFICIENT_VISIBILITY]: {
    label: 'Insufficient visibility',
    tone: 'error',
    blurb: 'Too much of the applicable control environment could not be confirmed for a defensible overall maturity conclusion.'
  }
};

export function reviewScreenHtml(result, { escapeHtml, escapeAttr, truncate, unansweredNodes, unknownNodes }) {
  const status = STATUS_COPY[result.reportStatus];
  const assessedDomains = result.domains.filter((d) => d.applicableCount > 0);
  const excludedByReason = groupBy(result.excludedControls, (c) => c.skip_reason_code || 'excluded');

  return `
    <section aria-labelledby="review-title">
      <p class="eyebrow"><span class="eyebrow__dot" aria-hidden="true"></span>Final review</p>
      <h1 id="review-title" class="question__prompt">Before you submit, here is what we assessed.</h1>
      <p class="question__guidance">
        Check anything marked for attention. You can go back and change any answer.
      </p>

      <!-- Three separate measures. They answer different questions and must not be conflated.
           The score is shown only when the assessment can support one: under
           INSUFFICIENT_VISIBILITY the figure and any maturity band are withheld, and the
           two supporting measures carry the result instead.
           CONTENT DECISION REQUIRED — NOT APPROVED FOR PRODUCTION. -->
      <div class="scorecard" data-testid="measures">
        <div class="scorecard__primary${result.scoreIssued ? '' : ' scorecard__primary--withheld'}">
          ${result.scoreIssued ? `
            <div class="scorecard__value" data-testid="frs">${result.customerFacingScore === null ? '—' : result.customerFacingScore}<span class="scorecard__of"> / 100</span></div>
            <div class="scorecard__label">Fraud Readiness Score</div>
            <div class="scorecard__note">Readiness across applicable controls. Under the proposed
            methodology, controls that could not be confirmed receive no maturity credit and are
            reported separately through Control Visibility.</div>
          ` : `
            <div class="scorecard__value scorecard__value--withheld" data-testid="score-not-issued">Not issued</div>
            <div class="scorecard__label">Fraud Readiness Score</div>
            <div class="scorecard__note" data-testid="score-withheld-reason">${escapeHtml(result.scoreWithheldReason)}</div>
          `}
        </div>
        <div class="scorecard__side">
          <div class="minimetric">
            <div class="minimetric__value" data-testid="coverage">${result.assessmentCoverage}%</div>
            <div class="minimetric__label">Assessment coverage</div>
            <div class="minimetric__note">Applicable controls that received any response.</div>
          </div>
          <div class="minimetric">
            <div class="minimetric__value" data-testid="visibility">${result.controlVisibility}%</div>
            <div class="minimetric__label">Control visibility</div>
            <div class="minimetric__note">Controls where you could confirm how they operate.</div>
          </div>
        </div>
      </div>

      <div class="statusbar statusbar--${status.tone}" data-testid="report-status" role="group" aria-label="Assessment status">
        <span class="statusbar__tag">${escapeHtml(status.label)}</span>
        <span class="statusbar__text">${escapeHtml(status.blurb)}</span>
      </div>

      ${result.reportLimitationReasons.length > 0 ? `
        <div class="callout callout--warn" data-testid="limitations">
          <span class="callout__icon" aria-hidden="true">!</span>
          <span>
            <strong>Why this result is limited</strong>
            <ul class="tightlist">
              ${result.reportLimitationReasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}
            </ul>
          </span>
        </div>` : ''}

      <!-- Assessed scope. The customer paid for this transparency. -->
      <div class="review__group">
        <h2 class="review__heading">Assessed scope</h2>
        <div class="rowitem">
          <div class="rowitem__main">
            <div class="rowitem__label">${result.counts.applicable} of ${result.counts.totalApproved} control areas applicable</div>
            <div class="rowitem__meta">Applicable control weight ${result.weights.applicable} of ${result.weights.total}</div>
          </div>
        </div>
        ${result.counts.excluded > 0 ? `
        <div class="rowitem">
          <div class="rowitem__main">
            <div class="rowitem__label">${result.counts.excluded} controls excluded by your declared operating profile</div>
            <div class="rowitem__meta">${result.materialExclusionShare}% of total control weight</div>
          </div>
          <span class="tag tag--excluded">Excluded</span>
        </div>` : ''}
        ${result.counts.redirected > 0 ? `
        <div class="rowitem">
          <div class="rowitem__main">
            <div class="rowitem__label">${result.counts.redirected} in-house controls replaced by third-party oversight controls</div>
            <div class="rowitem__meta">Outsourcing moves the activity, not the risk</div>
          </div>
          <span class="tag tag--outsourced">Oversight</span>
        </div>` : ''}
        ${result.counts.unknown > 0 ? `
        <div class="rowitem">
          <div class="rowitem__main">
            <div class="rowitem__label">${result.counts.unknown} controls recorded as "I do not know"</div>
            <div class="rowitem__meta">${result.unknownWeightShare}% of applicable control weight${affectedDomains(result)}</div>
          </div>
          <span class="tag tag--unknown">Unconfirmed</span>
        </div>` : ''}
        ${result.counts.unanswered > 0 ? `
        <div class="rowitem">
          <div class="rowitem__main">
            <div class="rowitem__label">${result.counts.unanswered} applicable controls not yet answered</div>
            <div class="rowitem__meta">These reduce coverage. They are not treated as weaknesses.</div>
          </div>
          <span class="tag tag--missing">Incomplete</span>
        </div>` : ''}
      </div>

      <!-- Comparability. Non-negotiable: the score is scope-specific. -->
      <div class="callout callout--info" data-testid="comparability">
        <span class="callout__icon" aria-hidden="true">i</span>
        <span>${escapeHtml(result.comparabilityStatement)}</span>
      </div>

      <div class="review__group">
        <h2 class="review__heading">Areas assessed</h2>
        ${assessedDomains.map((d) => `
          <div class="rowitem">
            <div class="rowitem__main">
              <div class="rowitem__label">${escapeHtml(d.name)}</div>
              <div class="rowitem__meta">${d.applicableCount} applicable${d.excludedCount ? ` · ${d.excludedCount} excluded` : ''} · visibility ${d.controlVisibility}%</div>
            </div>
            <span class="tag ${d.controlVisibility >= 85 ? 'tag--ok' : 'tag--unknown'}">${d.controlVisibility >= 85 ? 'Confirmed' : 'Partly confirmed'}</span>
          </div>`).join('')}
      </div>

      ${Object.keys(excludedByReason).length > 0 ? `
        <div class="review__group" data-testid="exclusion-schedule">
          <h2 class="review__heading">Areas excluded, and why</h2>
          ${Object.entries(excludedByReason).map(([code, items]) => `
            <div class="rowitem">
              <div class="rowitem__main">
                <div class="rowitem__label">${escapeHtml(items[0].skip_reason || 'Excluded by the declared operating profile.')}</div>
                <div class="rowitem__meta">${items.length} control${items.length === 1 ? '' : 's'} not assessed · reason code <code>${escapeHtml(code)}</code></div>
              </div>
              <span class="tag tag--excluded">Excluded</span>
            </div>`).join('')}
          <p class="question__guidance" style="font-size:0.8125rem;margin-top:0.75rem">
            This area was not assessed because the organisation indicated that the underlying
            activity does not form part of its operating model. Excluded controls earn no credit
            and carry no penalty, but they do change the assessed scope. If any of these are
            wrong, go back and correct the answer that caused them.
          </p>
        </div>` : ''}

      ${result.signals.length > 0 ? `
        <div class="review__group" data-testid="integrity-signals">
          <h2 class="review__heading">Points to confirm</h2>
          <p class="question__guidance" style="font-size:0.8125rem">
            Several answers materially shaped the applicable assessment scope. These will be
            recorded in the final report and may require confirmation.
          </p>
          ${result.signals.map((s) => `
            <div class="rowitem">
              <div class="rowitem__main">
                <div class="rowitem__label">${escapeHtml(humanise(s.id))}</div>
                <div class="rowitem__meta">${escapeHtml(s.detail)}</div>
              </div>
              ${s.blocking ? '<span class="tag tag--missing">Blocking</span>' : '<span class="tag tag--unknown">Note</span>'}
            </div>`).join('')}
        </div>` : ''}

      ${unknownNodes.length > 0 ? `
        <div class="review__group">
          <h2 class="review__heading">Worth confirming before you submit</h2>
          ${unknownNodes.slice(0, 8).map((n) => `
            <div class="rowitem">
              <div class="rowitem__main">
                <div class="rowitem__label">${escapeHtml(truncate(n.node.prompt, 110))}</div>
                <div class="rowitem__meta">${escapeHtml(n.domainName || '')}</div>
              </div>
              <button class="btn btn--quiet" data-action="jump" data-id="${escapeAttr(n.id)}" style="min-height:36px;padding:0.3rem 0.5rem">Revisit</button>
            </div>`).join('')}
          ${unknownNodes.length > 8 ? `<p class="rowitem__meta">…and ${unknownNodes.length - 8} more</p>` : ''}
        </div>` : ''}

      ${result.recommendationGroups.length > 0 ? `
        <div class="review__group" data-testid="recommendation-preview">
          <h2 class="review__heading">What your report will cover</h2>
          ${result.recommendationGroups.map((g) => `
            <div class="recgroup">
              <div class="recgroup__title">${escapeHtml(g.title)} <span class="recgroup__count">${g.items.length}</span></div>
              <ul class="tightlist">
                ${g.items.slice(0, 3).map((r) => `<li>${escapeHtml(truncate(r.body, 150))}</li>`).join('')}
                ${g.items.length > 3 ? `<li class="rowitem__meta">…and ${g.items.length - 3} more</li>` : ''}
              </ul>
            </div>`).join('')}
          <p class="question__guidance" style="font-size:0.8125rem">
            Controls you confirmed are operating well produce no remedial recommendation.
            Excluded activities produce none either — we do not recommend controls for things
            your organisation does not do.
          </p>
        </div>` : ''}

      <div class="callout callout--info">
        <span class="callout__icon" aria-hidden="true">i</span>
        <span>This is a preview based on your current answers. Your final report is generated
        after submission.</span>
      </div>

      <div class="actions">
        <button class="btn btn--ghost" data-action="back-to-questions">Back to questions</button>
        <div class="actions__spacer"></div>
        <button class="btn btn--primary" data-action="submit" ${unansweredNodes.length > 0 ? 'disabled' : ''}>Submit assessment</button>
      </div>
    </section>
  `;
}

function affectedDomains(result) {
  const domains = result.domains.filter((d) => d.unknownShare > 0).map((d) => d.domainCode);
  return domains.length ? ` · affects ${domains.join(', ')}` : '';
}

function groupBy(list, keyFn) {
  const out = {};
  for (const item of list) {
    const k = keyFn(item);
    (out[k] = out[k] || []).push(item);
  }
  return out;
}

function humanise(id) {
  return id.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

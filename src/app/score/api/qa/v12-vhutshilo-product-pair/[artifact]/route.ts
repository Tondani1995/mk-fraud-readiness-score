import crypto from 'node:crypto';
import { generateText, Output } from 'ai';
import { NextResponse } from 'next/server';
import { buildVhutshiloV12Assembled, VHUTSHILO_V12_GRAPH, VHUTSHILO_V12_SOURCE_SHA } from '@/lib/qa/v12-vhutshilo-fixture';
import { buildAdvisoryEvidenceModel } from '@/lib/reports/evidence-model';
import { renderComprehensiveReportPackage } from '@/lib/reports/comprehensive/manual-generation';
import {
  buildInterpretationPrompt,
  interpretationSchema,
  validateInterpretation,
  type ComprehensiveInterpretation,
  type InterpretationBrief,
  type InterpretationRun,
  type InterpretationSlotId
} from '@/lib/reports/comprehensive/interpretation';
import { validateEssentialFinalHtml, type EssentialValidationCascadeResult } from '@/lib/reports/essential-validation-cascade';
import { renderHtmlToPdfBuffer } from '@/lib/reports/render-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ENGINE_SOURCE_SHA = '85fd2a0e21a6221bbd6b5032cc0bd271ebe7d26d';
const ESSENTIAL_MODEL = 'openai/gpt-5-mini';
const COMPREHENSIVE_MODEL = 'openai/gpt-5.6-luna';
const SYSTEM = 'You are the MK Fraud Readiness Comprehensive interpretation writer. The deterministic analysis you are given is the only authority. RETURN EXACTLY ONE JSON OBJECT as plain text: no commentary, no Markdown, no code fences, no additional keys.';

function sha256(bytes: Uint8Array | Buffer | string): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function tarHeader(name: string, size: number): Buffer {
  const header = Buffer.alloc(512, 0);
  const put = (value: string, offset: number, length: number) => header.write(value.slice(0, length), offset, length, 'ascii');
  put(name, 0, 100);
  put('0000644\0', 100, 8);
  put('0000000\0', 108, 8);
  put('0000000\0', 116, 8);
  put(`${size.toString(8).padStart(11, '0')}\0`, 124, 12);
  put(`${Math.floor(Date.now() / 1000).toString(8).padStart(11, '0')}\0`, 136, 12);
  header.fill(0x20, 148, 156);
  put('0', 156, 1);
  put('ustar\0', 257, 6);
  put('00', 263, 2);
  let sum = 0;
  for (const byte of header) sum += byte;
  put(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8);
  return header;
}

function buildTar(files: Array<{ name: string; bytes: Buffer }>): Buffer {
  const chunks: Buffer[] = [];
  for (const file of files) {
    chunks.push(tarHeader(file.name, file.bytes.length), file.bytes);
    const remainder = file.bytes.length % 512;
    if (remainder) chunks.push(Buffer.alloc(512 - remainder));
  }
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}

/**
 * Comprehensive keeps raw assessment question codes internally for traceability,
 * but a buyer-facing report should use its own clean register references. The same
 * presentation seam also makes deterministic target-state assurance wording explicit:
 * a control requirement must not read like a claim that MK already verified it.
 */
function customerFacingPresentation(html: string): string {
  const aliases = new Map<string, string>();
  const counters = { F: 0, C: 0, A: 0 };
  const deInternalised = html.replace(/\b(?:MF-|CI-)?D\d+-Q\d+\b/g, (raw) => {
    const family: keyof typeof counters = raw.startsWith('MF-') ? 'F' : raw.startsWith('CI-') ? 'C' : 'A';
    const key = `${family}:${raw}`;
    const existing = aliases.get(key);
    if (existing) return existing;
    counters[family] += 1;
    const alias = `${family}-${String(counters[family]).padStart(2, '0')}`;
    aliases.set(key, alias);
    return alias;
  });

  return deInternalised
    .replaceAll(
      'All material stock and physical assets are counted and reconciled on schedule, with shrinkage and write-offs independently reviewed.',
      'Target state: management should count and reconcile all material stock and physical assets on schedule, with shrinkage and write-offs subject to independent review.'
    )
    .replaceAll(
      'Independent review scope and report',
      'Independent review requirement: defined scope and review report'
    );
}

function deterministicMeta() {
  const { data, score, path, controlResponses } = buildVhutshiloV12Assembled();
  return {
    sourceSha: ENGINE_SOURCE_SHA,
    assessmentBaselineSha: VHUTSHILO_V12_SOURCE_SHA,
    deploymentSourceSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    graphVersion: VHUTSHILO_V12_GRAPH,
    organisationName: data.organisationName,
    assessmentReference: data.assessmentReference,
    reportReference: data.reportReference,
    score: data.scoreRun.overallScore,
    calculatedMaturity: data.scoreRun.calculatedMaturity,
    finalMaturity: data.scoreRun.finalMaturity,
    coveragePct: data.scoreRun.coveragePct,
    applicableControls: score.metrics.applicableCount,
    excludedControls: score.metrics.excludedCount,
    redirectedControls: score.metrics.redirectedCount,
    unknownControls: score.metrics.unknownCount,
    activeResponseCount: Object.keys(controlResponses).length,
    activePathCount: path.activePathCount
  };
}

function parseObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object in provider output.');
  return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
}

async function generateComprehensiveInterpretationViaOidc(
  brief: InterpretationBrief,
  options?: { model?: string; maxRepairsPerSlot?: number; timeoutMs?: number }
): Promise<InterpretationRun> {
  const model = options?.model ?? COMPREHENSIVE_MODEL;
  const provider = model.split('/')[0]?.trim() || 'openai';
  const maxRepairs = options?.maxRepairsPerSlot ?? 2;
  const timeoutMs = options?.timeoutMs ?? 240_000;
  const accounting = {
    calls: 0,
    repairs: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costMicros: 0,
    durationMs: 0,
    model,
    repairedSlots: [] as InterpretationSlotId[]
  };
  const startedAt = Date.now();

  const call = async (prompt: string): Promise<Record<string, unknown>> => {
    accounting.calls += 1;
    const response: any = await generateText({
      model,
      system: SYSTEM,
      prompt,
      output: Output.text(),
      maxOutputTokens: 6_000,
      maxRetries: 0,
      providerOptions: { gateway: { only: [provider] } },
      abortSignal: AbortSignal.timeout(timeoutMs)
    });
    accounting.inputTokens += Number(response?.usage?.inputTokens ?? 0);
    accounting.outputTokens += Number(response?.usage?.outputTokens ?? 0);
    accounting.totalTokens += Number(response?.usage?.totalTokens ?? 0);
    const cost = Number(response?.providerMetadata?.gateway?.cost ?? 0);
    if (Number.isFinite(cost)) accounting.costMicros += Math.round(cost * 1e6);
    const text = typeof response.output === 'string' ? response.output : typeof response.text === 'string' ? response.text : '';
    return parseObject(text);
  };

  const initial = await call(buildInterpretationPrompt(brief));
  let current = interpretationSchema.partial().parse(initial) as Partial<ComprehensiveInterpretation>;
  let issues = validateInterpretation(current, brief);

  for (let attempt = 1; attempt <= maxRepairs; attempt += 1) {
    const failing = [...new Set(issues.map((issue) => issue.slot))];
    if (!failing.length) break;
    const reasons = failing
      .map((slot) => `- ${slot}: ${issues.filter((issue) => issue.slot === slot).map((issue) => `${issue.code} (${issue.detail})`).join('; ')}`)
      .join('\n');
    const prompt = [
      buildInterpretationPrompt(brief, failing),
      '',
      '================ REPAIR ================',
      'Your previous attempt at these fields was rejected. Correct only these reasons. Keep the meaning; change what the reasons name.',
      reasons,
      '',
      'PREVIOUS TEXT:',
      JSON.stringify(Object.fromEntries(failing.map((slot) => [slot, current[slot] ?? '']))),
      '',
      `Return exactly one JSON object with exactly these keys: ${failing.join(', ')}.`
    ].join('\n');
    const repaired = await call(prompt);
    accounting.repairs += 1;
    for (const slot of failing) {
      const value = repaired[slot];
      if (typeof value === 'string' && value.trim()) {
        current = { ...current, [slot]: value };
        if (!accounting.repairedSlots.includes(slot)) accounting.repairedSlots.push(slot);
      }
    }
    issues = validateInterpretation(current, brief);
  }

  accounting.durationMs = Date.now() - startedAt;
  return {
    interpretation: interpretationSchema.parse(current),
    issues,
    accounting
  };
}

async function renderComprehensiveTar(): Promise<Buffer> {
  const { data } = buildVhutshiloV12Assembled();
  const advisoryModel = buildAdvisoryEvidenceModel(data);
  let finalValidation: EssentialValidationCascadeResult | null = null;

  const result = await renderComprehensiveReportPackage({
    assembled: data,
    evidenceModel: advisoryModel,
    maxRepairsPerSlot: 2,
    orderReference: data.orderReference,
    reportReference: data.reportReference,
    versionNumber: 1,
    generateInterpretation: async (brief, options) => {
      const run = await generateComprehensiveInterpretationViaOidc(brief, {
        ...options,
        model: COMPREHENSIVE_MODEL
      });
      if (run.issues.length) {
        throw new Error(`Comprehensive interpretation unresolved issues: ${JSON.stringify(run.issues)}`);
      }
      return run;
    },
    renderPdf: async (html, options) => {
      const customerHtml = customerFacingPresentation(html);
      const validation = validateEssentialFinalHtml({ html: customerHtml, data });
      if (!validation.publishable) {
        const diagnostics = validation.candidates
          .filter((candidate) => candidate.finalDisposition !== 'ACCEPT')
          .map((candidate) => ({
            ruleCode: candidate.ruleCode,
            disposition: candidate.finalDisposition,
            path: candidate.path,
            span: candidate.span,
            decisions: candidate.decisions
          }));
        throw new Error(`Comprehensive final validation blocked: ${JSON.stringify(diagnostics)}`);
      }
      finalValidation = validation;
      return renderHtmlToPdfBuffer(customerHtml, options);
    }
  });

  const acceptedValidation = finalValidation as EssentialValidationCascadeResult | null;
  if (!acceptedValidation || !acceptedValidation.publishable) {
    throw new Error('Comprehensive final five-layer validation did not reach publishable acceptance.');
  }

  const meta = {
    ...deterministicMeta(),
    tier: 'Comprehensive',
    model: result.interpretationRun.accounting.model,
    interpretationAccounting: result.interpretationRun.accounting,
    interpretationIssues: result.interpretationRun.issues,
    assemblyVersion: result.source.assemblyVersion,
    managementModelVersion: result.source.managementModelVersion,
    finalValidation: {
      policyVersion: acceptedValidation.policyVersion,
      publishable: acceptedValidation.publishable,
      finalHtmlSha256: acceptedValidation.finalHtmlSha256,
      blockingCodes: acceptedValidation.blockingCodes,
      heldForReviewCodes: acceptedValidation.heldForReviewCodes,
      warningCodes: acceptedValidation.warningCodes,
      candidateCount: acceptedValidation.candidates.length
    },
    pdf: { bytes: result.pdf.length, sha256: sha256(result.pdf) },
    workbook: {
      fileName: result.workbook.fileName,
      bytes: result.workbook.bytes.length,
      sha256: result.workbook.checksumSha256,
      sheetNames: result.workbook.sheetNames,
      rowCounts: result.workbook.rowCounts
    }
  };

  return buildTar([
    { name: `${data.reportReference}-COMPREHENSIVE.pdf`, bytes: result.pdf },
    { name: result.workbook.fileName, bytes: result.workbook.bytes },
    { name: 'comprehensive-meta.json', bytes: Buffer.from(JSON.stringify(meta, null, 2), 'utf8') }
  ]);
}

export async function GET(_request: Request, props: { params: Promise<{ artifact: string }> }) {
  const { artifact } = await props.params;
  try {
    if (artifact === 'meta') {
      return NextResponse.json({
        ok: true,
        ...deterministicMeta(),
        essentialModel: ESSENTIAL_MODEL,
        comprehensiveModel: COMPREHENSIVE_MODEL,
        comprehensiveAuth: 'vercel-oidc'
      }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (artifact === 'comprehensive') {
      const tar = await renderComprehensiveTar();
      return new Response(new Uint8Array(tar), {
        status: 200,
        headers: {
          'Content-Type': 'application/x-tar',
          'Content-Disposition': 'attachment; filename="vhutshilo-comprehensive-package.tar"',
          'Cache-Control': 'no-store',
          'X-MK-Source-SHA': ENGINE_SOURCE_SHA,
          'X-MK-Assessment-Baseline-SHA': VHUTSHILO_V12_SOURCE_SHA,
          'X-MK-Model': COMPREHENSIVE_MODEL,
          'X-MK-TAR-SHA256': sha256(tar)
        }
      });
    }
    return NextResponse.json({ ok: false, error: 'unknown_artifact' }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('v12_vhutshilo_product_pair_failed', { artifact, message });
    return NextResponse.json({ ok: false, artifact, error: message.slice(0, 12000) }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

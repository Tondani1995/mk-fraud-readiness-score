'use client';

import { useEffect, useState } from 'react';

const GENERATION_URL = '/score/api/qa/recovery-v10-v12-vhutshilo-store?confirm=one-shot-v10-v12-vhutshilo-20260824';
const GENERATED_FILENAME = 'RPT-MKFRS-V12-ESS-VHUTSHILO-FRESH-ACCEPTANCE.pdf';

type GenerationStatus = 'idle' | 'generating' | 'ready' | 'failed';

type GenerationProof = {
  score: string | null;
  maturity: string | null;
  providerCalls: string | null;
  checksum: string | null;
};

export function VhutshiloRecoveryWorkspace({ initialPdfPath }: { initialPdfPath: string }) {
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [proof, setProof] = useState<GenerationProof | null>(null);

  useEffect(() => () => {
    if (generatedPdfUrl) URL.revokeObjectURL(generatedPdfUrl);
  }, [generatedPdfUrl]);

  async function generate() {
    setStatus('generating');
    setErrorMessage(null);
    setProof(null);

    try {
      const response = await fetch(GENERATION_URL, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/pdf' }
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
        const safeReason = typeof payload.error === 'string'
          ? payload.error
          : typeof payload.generatorError === 'string'
            ? 'The recovery generator did not complete successfully.'
            : `Generation returned HTTP ${response.status}.`;
        setErrorMessage(safeReason);
        setStatus('failed');
        return;
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('application/pdf')) {
        setErrorMessage('Generation completed without a valid PDF response.');
        setStatus('failed');
        return;
      }

      const blob = await response.blob();
      if (blob.size < 100_000) {
        setErrorMessage('The generated PDF was unexpectedly small and was not accepted.');
        setStatus('failed');
        return;
      }

      const nextUrl = URL.createObjectURL(blob);
      setGeneratedPdfUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return nextUrl;
      });
      setProof({
        score: response.headers.get('x-mk-score'),
        maturity: response.headers.get('x-mk-maturity'),
        providerCalls: response.headers.get('x-mk-provider-calls'),
        checksum: response.headers.get('x-mk-sha256')
      });
      setStatus('ready');
    } catch {
      setErrorMessage('The recovery generation request could not be completed.');
      setStatus('failed');
    }
  }

  const activePdf = generatedPdfUrl ?? initialPdfPath;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-mk-line bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-semibold text-mk-ink">Report generation controls</p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-mk-muted">
              Generate a fresh Vhutshilo acceptance candidate through the preview-only recovery pipeline. This synthetic control does not create or mutate a production or staging commercial order. A fresh generation may make one provider call.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={generate}
              disabled={status === 'generating'}
              className="inline-flex items-center justify-center rounded-xl bg-mk-charcoal px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === 'generating' ? 'Generating…' : 'Generate new version'}
            </button>
            {status === 'failed' ? (
              <button
                type="button"
                onClick={generate}
                className="inline-flex items-center justify-center rounded-xl border border-mk-line bg-white px-4 py-2.5 text-sm font-semibold text-mk-ink transition hover:bg-mk-cream"
              >
                Retry generation
              </button>
            ) : null}
            {status === 'ready' && generatedPdfUrl ? (
              <a
                href={generatedPdfUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-xl border border-mk-line bg-white px-4 py-2.5 text-sm font-semibold text-mk-ink transition hover:bg-mk-cream"
              >
                Open generated PDF
              </a>
            ) : null}
            {status === 'ready' && generatedPdfUrl ? (
              <a
                href={generatedPdfUrl}
                download={GENERATED_FILENAME}
                className="inline-flex items-center justify-center rounded-xl border border-mk-line bg-white px-4 py-2.5 text-sm font-semibold text-mk-ink transition hover:bg-mk-cream"
              >
                Download generated PDF
              </a>
            ) : null}
          </div>
        </div>

        {status === 'failed' ? (
          <div className="mt-4 rounded-xl border border-mk-danger/30 bg-mk-danger/10 px-4 py-3 text-sm text-mk-danger">
            Generation failed. {errorMessage ?? 'Use Retry generation to make a new controlled attempt.'}
          </div>
        ) : null}

        {status === 'ready' ? (
          <div className="mt-4 rounded-xl border border-mk-line bg-mk-cream/60 px-4 py-3 text-sm leading-6 text-mk-muted">
            Fresh candidate ready{proof?.score ? ` · Score ${proof.score}` : ''}{proof?.maturity ? ` · ${proof.maturity}` : ''}{proof?.providerCalls ? ` · Provider calls ${proof.providerCalls}` : ''}{proof?.checksum ? ` · SHA256 ${proof.checksum.slice(0, 12)}…` : ''}. The preview below has switched to this newly generated PDF.
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-mk-line bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-mk-ink">Report preview</p>
            <p className="mt-1 text-sm text-mk-muted">
              {generatedPdfUrl ? 'Freshly generated acceptance candidate' : 'Captured recovery artefact'}
            </p>
          </div>
          <a
            href={activePdf}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-xl border border-mk-line bg-white px-4 py-2.5 text-sm font-semibold text-mk-ink transition hover:bg-mk-cream"
          >
            Open current PDF
          </a>
        </div>
        <iframe
          title="Vhutshilo Essential V1.2 report"
          src={activePdf}
          className="h-[78vh] min-h-[720px] w-full rounded-xl border border-mk-line bg-white"
        />
      </div>
    </div>
  );
}

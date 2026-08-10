'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

const recordTypes = ['finding', 'risk', 'control_design', 'decision', 'management_action'] as const;
const evidenceStatuses = ['not_requested', 'requested', 'received', 'reviewed', 'supported', 'not_supported', 'insufficient', 'not_applicable'] as const;

type WorkspaceData = any;

export function ComprehensiveReviewWorkspace({ orderReference }: { orderReference: string }) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewerId, setReviewerId] = useState('');
  const [signOffStatement, setSignOffStatement] = useState('');
  const [presentation, setPresentation] = useState<File | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/score/api/admin/comprehensive/${encodeURIComponent(orderReference)}`, { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) { setError(body.message ?? 'The Comprehensive engagement could not be loaded.'); return; }
    setData(body);
    setReviewerId(body.engagement.reviewerAdminUserId ?? body.reviewers?.[0]?.id ?? '');
  }, [orderReference]);
  useEffect(() => { void load(); }, [load]);

  async function post(path: string, init: RequestInit) {
    setError(null); setMessage(null);
    const response = await fetch(`/score/api/admin/comprehensive/${encodeURIComponent(orderReference)}${path}`, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) { setError(body.message ?? body.reason ?? 'The operation failed.'); return null; }
    setMessage('Saved.'); await load(); return body;
  }

  if (!data) return <Card><CardContent className="p-6 text-sm text-mk-muted">Loading Comprehensive engagement…{error ? ` ${error}` : ''}</CardContent></Card>;
  const engagement = data.engagement;
  const records = new Map((data.reviewRecords ?? []).map((record: any) => [`${record.recordType}:${record.subjectKey}`, record]));
  const missing = recordTypes.filter((type) => !(data.reviewRecords ?? []).some((record: any) => record.recordType === type && record.reviewerConclusion));
  const latestReport = data.reports?.[0];

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-mk-brassDark">Comprehensive reviewer workspace</p><h1 className="mt-2 text-3xl font-semibold text-mk-ink">{orderReference}</h1><p className="mt-2 text-sm text-mk-muted">Persisted engagement, evidence, reviewer records and exact-version release control.</p></div><Badge>{engagement.state.replaceAll('_', ' ')}</Badge></div>
    {error ? <p role="alert" className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm text-mk-danger">{error}</p> : null}
    {message ? <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p> : null}

    <Card><CardHeader><CardTitle>Assessment / order / payment</CardTitle></CardHeader><CardContent className="grid gap-4 text-sm sm:grid-cols-3"><Info label="Assessment" value={engagement.assessmentReference} /><Info label="Order" value={engagement.orderReference} /><Info label="Payment" value={data.order?.status ?? 'Not recorded'} /><Info label="Amount" value={data.order?.amount_cents ? `R ${(Number(data.order.amount_cents) / 100).toLocaleString('en-ZA')}` : 'Not captured'} /><Info label="Evidence" value={`${engagement.evidenceCount} uploaded · ${engagement.unreviewedEvidenceCount} unresolved`} /><Info label="Sign-off version" value={engagement.signedOffArtifactVersion ? String(engagement.signedOffArtifactVersion) : 'Not signed'} /></CardContent></Card>

    <Card><CardHeader><CardTitle>Named reviewer</CardTitle></CardHeader><CardContent className="flex flex-wrap items-end gap-3"><label className="min-w-64 text-sm font-semibold text-mk-ink">Reviewer<select className="mt-2 block w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal" value={reviewerId} onChange={(event) => setReviewerId(event.target.value)}><option value="">Choose reviewer</option>{(data.reviewers ?? []).map((reviewer: any) => <option key={reviewer.id} value={reviewer.id}>{reviewer.full_name} · {reviewer.role}</option>)}</select></label><Button type="button" onClick={() => void post('/reviewer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewerAdminUserId: reviewerId, note: 'Assigned from the Comprehensive reviewer workspace.' }) })} disabled={!reviewerId}>Assign reviewer</Button></CardContent></Card>

    <Card><CardHeader><CardTitle>Uploaded evidence and reviewer classification</CardTitle></CardHeader><CardContent className="space-y-4">{(data.evidence ?? []).length ? data.evidence.map((item: any) => <EvidenceRow key={item.id} item={item} onSave={async (status, observation) => { await post(`/evidence/${item.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ validationStatus: status, observation }) }); }} />) : <p className="text-sm text-mk-muted">No evidence has been uploaded by the customer.</p>}</CardContent></Card>

    <Card><CardHeader><CardTitle>Required human-review records</CardTitle><p className="mt-1 text-sm font-normal text-mk-muted">Each record is versioned. Updates retain the original creator and write the approver as updated_by.</p></CardHeader><CardContent className="space-y-4">{missing.length ? <p className="rounded-xl border border-mk-brass/30 bg-mk-brass/10 p-4 text-sm text-mk-ink">Unresolved required records: {missing.join(', ')}</p> : <p className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">All five required review record types are present.</p>}{recordTypes.map((type) => <ReviewRecordEditor key={type} type={type} initial={records.get(`${type}:${type}`) ?? [...records.values()].find((record: any) => record.recordType === type)} onSave={(payload) => post('/review-records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })} />)}</CardContent></Card>

    <Card><CardHeader><CardTitle>Generate and preview deliverables</CardTitle><p className="mt-1 text-sm font-normal text-mk-muted">PDF, annotated XLSX, board PDF and workshop PDF are generated from persisted assessment and reviewer state. PPTX requires an approved reviewer-uploaded presentation artefact.</p></CardHeader><CardContent className="space-y-4"><label className="block text-sm font-semibold text-mk-ink">Approved executive presentation (.pptx)<input className="mt-2 block w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal" type="file" accept="application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={(event) => setPresentation(event.target.files?.[0] ?? null)} /></label><Button type="button" onClick={async () => { const form = new FormData(); if (presentation) form.set('executivePresentation', presentation); const result = await post('/generate', { method: 'POST', body: form }); if (result) setPresentation(null); }} disabled={!presentation}>Generate actual Comprehensive package</Button>{latestReport ? <div className="rounded-xl border border-mk-line p-4 text-sm text-mk-muted"><p className="font-semibold text-mk-ink">Latest report: {latestReport.report_reference} · version {latestReport.version_number} · {latestReport.status}</p><p className="mt-2">Artefacts: {(data.artifacts ?? []).filter((artifact: any) => artifact.report_id === latestReport.id).map((artifact: any) => `${artifact.artefact_type} (${artifact.release_state})`).join(', ') || 'none'}</p></div> : null}</CardContent></Card>

    <Card><CardHeader><CardTitle>Sign off, release and deliver</CardTitle><p className="mt-1 text-sm font-normal text-mk-muted">The controls enforce: verified artefacts → reviewer signoff → review_complete → exact-version release → delivered.</p></CardHeader><CardContent className="space-y-4"><label className="block text-sm font-semibold text-mk-ink">Sign-off statement<textarea className="mt-2 block min-h-24 w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal" value={signOffStatement} onChange={(event) => setSignOffStatement(event.target.value)} placeholder="I reviewed the persisted evidence and records for this exact artifact version…" /></label><div className="flex flex-wrap gap-3"><Button type="button" onClick={() => void post('/transition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nextState: 'in_review', expectedStateVersion: engagement.stateVersion }) })}>Move to in review</Button><Button type="button" onClick={() => void post('/transition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nextState: 'review_complete', signOffStatement, expectedStateVersion: engagement.stateVersion }) })} disabled={!signOffStatement.trim()}>Sign off / complete review</Button><Button type="button" variant="secondary" onClick={() => void post('/finalise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reportId: latestReport?.id, artifactVersion: engagement.signedOffArtifactVersion }) })} disabled={!latestReport?.id || !engagement.signedOffArtifactVersion}>Release exact signed-off version</Button><Button type="button" variant="secondary" onClick={() => void post('/transition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nextState: 'delivered', expectedStateVersion: engagement.stateVersion }) })} disabled={engagement.state !== 'review_complete'}>Mark delivered</Button></div></CardContent></Card>
  </div>;
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-mk-muted">{label}</p><p className="mt-1 font-semibold text-mk-ink">{value || 'Not recorded'}</p></div>; }

function EvidenceRow({ item, onSave }: { item: any; onSave: (status: string, observation: string) => Promise<void> }) {
  const [status, setStatus] = useState(item.validationStatus);
  const [observation, setObservation] = useState(item.reviewerObservation ?? '');
  return <div className="rounded-xl border border-mk-line p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-mk-ink">{item.evidenceLabel || item.originalFilename}</strong><Badge>{item.validationStatus}</Badge></div><p className="mt-2 text-sm text-mk-muted">{item.contentType} · {Number(item.sizeBytes).toLocaleString()} bytes</p><div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end"><label className="text-sm font-semibold text-mk-ink">Classification<select className="mt-2 block w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal" value={status} onChange={(event) => setStatus(event.target.value)}>{evidenceStatuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="text-sm font-semibold text-mk-ink">Reviewer note<textarea className="mt-2 block min-h-12 w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal" value={observation} onChange={(event) => setObservation(event.target.value)} /></label><Button type="button" onClick={() => void onSave(status, observation)}>Save evidence decision</Button></div></div>;
}

function ReviewRecordEditor({ type, initial, onSave }: { type: string; initial?: any; onSave: (payload: any) => Promise<unknown> }) {
  const [subjectKey, setSubjectKey] = useState(initial?.subjectKey ?? type);
  const [conclusion, setConclusion] = useState(initial?.reviewerConclusion ?? '');
  const [observation, setObservation] = useState(initial?.reviewerObservation ?? '');
  const [options, setOptions] = useState((initial?.decisionOptions ?? []).join('\n'));
  return <div className="rounded-xl border border-mk-line p-4"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold capitalize text-mk-ink">{type.replaceAll('_', ' ')}</h3><Badge>v{initial?.recordVersion ?? 0}</Badge></div><div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-sm font-semibold text-mk-ink">Subject key<input className="mt-2 block w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal" value={subjectKey} onChange={(event) => setSubjectKey(event.target.value)} /></label><label className="text-sm font-semibold text-mk-ink">Reviewer conclusion<input className="mt-2 block w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal" value={conclusion} onChange={(event) => setConclusion(event.target.value)} /></label><label className="text-sm font-semibold text-mk-ink">Observation / limitation<textarea className="mt-2 block min-h-16 w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal" value={observation} onChange={(event) => setObservation(event.target.value)} /></label><label className="text-sm font-semibold text-mk-ink">Decision options / trade-offs<textarea className="mt-2 block min-h-16 w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal" value={options} onChange={(event) => setOptions(event.target.value)} /></label></div><Button className="mt-3" type="button" onClick={() => void onSave({ recordType: type, subjectKey, reviewerConclusion: conclusion, reviewerObservation: observation, decisionOptions: options.split('\n').map((item: string) => item.trim()).filter(Boolean), expectedVersion: initial?.recordVersion ?? null, evidenceRefs: [], managementAction: type === 'management_action' ? { action: observation } : {} })} disabled={!subjectKey.trim() || !conclusion.trim()}>Save {type.replaceAll('_', ' ')}</Button></div>;
}

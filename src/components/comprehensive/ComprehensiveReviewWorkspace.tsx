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
  const authority = data.subjectAuthority ?? { findings: [], risks: [], controlDesigns: [], decisions: [], managementActions: [], allEvidenceRefs: [] };
  const subjectsByType: Record<string, any[]> = {
    finding: authority.findings,
    risk: authority.risks,
    control_design: authority.controlDesigns,
    decision: authority.decisions,
    management_action: authority.managementActions
  };
  const recordsByType = new Map(recordTypes.map((type) => [type, (data.reviewRecords ?? []).filter((record: any) => record.recordType === type)]));
  const latestReport = data.reports?.[0];

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-mk-brassDark">Comprehensive reviewer workspace</p><h1 className="mt-2 text-3xl font-semibold text-mk-ink">{orderReference}</h1><p className="mt-2 text-sm text-mk-muted">Review subjects are selectable from the current persisted analytical universe.</p></div><Badge>{engagement.state.replaceAll('_', ' ')}</Badge></div>
    {error ? <p role="alert" className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm text-mk-danger">{error}</p> : null}
    {message ? <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p> : null}

    <Card><CardHeader><CardTitle>Assessment / order / payment</CardTitle></CardHeader><CardContent className="grid gap-4 text-sm sm:grid-cols-3"><Info label="Assessment" value={engagement.assessmentReference} /><Info label="Order" value={engagement.orderReference} /><Info label="Payment" value={data.order?.status ?? 'Not recorded'} /><Info label="Amount" value={data.order?.amount_cents ? `R ${(Number(data.order.amount_cents) / 100).toLocaleString('en-ZA')}` : 'Not captured'} /><Info label="Evidence" value={`${engagement.evidenceCount} uploaded · ${engagement.unreviewedEvidenceCount} unresolved`} /><Info label="Sign-off version" value={engagement.signedOffArtifactVersion ? String(engagement.signedOffArtifactVersion) : 'Not signed'} /></CardContent></Card>

    <Card><CardHeader><CardTitle>Named reviewer</CardTitle></CardHeader><CardContent className="flex flex-wrap items-end gap-3"><label className="min-w-64 text-sm font-semibold text-mk-ink">Reviewer<select className="mt-2 block w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal" value={reviewerId} onChange={(event) => setReviewerId(event.target.value)}><option value="">Choose reviewer</option>{(data.reviewers ?? []).map((reviewer: any) => <option key={reviewer.id} value={reviewer.id}>{reviewer.full_name} · {reviewer.role}</option>)}</select></label><Button type="button" onClick={() => void post('/reviewer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewerAdminUserId: reviewerId, note: 'Assigned from the Comprehensive reviewer workspace.' }) })} disabled={!reviewerId}>Assign reviewer</Button></CardContent></Card>

    <Card><CardHeader><CardTitle>Uploaded evidence and reviewer classification</CardTitle><p className="mt-1 text-sm font-normal text-mk-muted">Link each reviewed upload to the deterministic evidence references it actually supports. A status alone never changes a finding conclusion.</p></CardHeader><CardContent className="space-y-4">{(data.evidence ?? []).length ? data.evidence.map((item: any) => <EvidenceRow key={item.id} item={item} availableRefs={authority.allEvidenceRefs} onSave={async (status, observation, analyticalEvidenceRefs) => { await post(`/evidence/${item.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ validationStatus: status, observation, analyticalEvidenceRefs }) }); }} />) : <p className="text-sm text-mk-muted">No evidence has been uploaded by the customer.</p>}</CardContent></Card>

    <Card><CardHeader><CardTitle>Human review against the analytical universe</CardTitle><p className="mt-1 text-sm font-normal text-mk-muted">Each type may contain multiple existing records. Subject IDs cannot be typed; they are resolved from the current assessment. Updates retain created_by and require the current expectedVersion.</p></CardHeader><CardContent className="space-y-6">{recordTypes.map((type) => <section key={type} aria-labelledby={`${type}-heading`} className="space-y-3"><div><h2 id={`${type}-heading`} className="font-semibold capitalize text-mk-ink">{type.replaceAll('_', ' ')}</h2><p className="text-sm text-mk-muted">{subjectsByType[type].length} selectable current-assessment subject(s).</p></div>{(recordsByType.get(type) ?? []).map((record: any) => <ReviewRecordEditor key={`${record.id}:${record.recordVersion}`} type={type} initial={record} subjects={subjectsByType[type]} availableRefs={authority.allEvidenceRefs} onSave={(payload) => post('/review-records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })} />)}<ReviewRecordEditor key={`new-${type}`} type={type} subjects={subjectsByType[type]} availableRefs={authority.allEvidenceRefs} onSave={(payload) => post('/review-records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })} /></section>)}</CardContent></Card>

    <Card><CardHeader><CardTitle>Generate and preview deliverables</CardTitle><p className="mt-1 text-sm font-normal text-mk-muted">All five artefacts are uploaded before one atomic package registration RPC. PPTX remains a reviewer-uploaded approved presentation.</p></CardHeader><CardContent className="space-y-4"><label className="block text-sm font-semibold text-mk-ink">Approved executive presentation (.pptx)<input className="mt-2 block w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal" type="file" accept="application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={(event) => setPresentation(event.target.files?.[0] ?? null)} /></label><Button type="button" onClick={async () => { const form = new FormData(); if (presentation) form.set('executivePresentation', presentation); const result = await post('/generate', { method: 'POST', body: form }); if (result) setPresentation(null); }} disabled={!presentation}>Generate actual Comprehensive package</Button>{latestReport ? <div className="rounded-xl border border-mk-line p-4 text-sm text-mk-muted"><p className="font-semibold text-mk-ink">Latest report: {latestReport.report_reference} · version {latestReport.version_number} · {latestReport.status}</p><p className="mt-2">Artefacts: {(data.artifacts ?? []).filter((artifact: any) => artifact.report_id === latestReport.id).map((artifact: any) => `${artifact.artefact_type} (${artifact.release_state})`).join(', ') || 'none'}</p></div> : null}</CardContent></Card>

    <Card><CardHeader><CardTitle>Sign off, release and deliver</CardTitle><p className="mt-1 text-sm font-normal text-mk-muted">The controls enforce: verified artefacts → reviewer signoff → review_complete → exact-version release → delivered.</p></CardHeader><CardContent className="space-y-4"><label className="block text-sm font-semibold text-mk-ink">Sign-off statement<textarea className="mt-2 min-h-24 w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal" value={signOffStatement} onChange={(event) => setSignOffStatement(event.target.value)} placeholder="I reviewed the persisted evidence and records for this exact artifact version…" /></label><div className="flex flex-wrap gap-3"><Button type="button" onClick={() => void post('/transition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nextState: 'in_review', expectedStateVersion: engagement.stateVersion }) })}>Move to in review</Button><Button type="button" onClick={() => void post('/transition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nextState: 'review_complete', signOffStatement, expectedStateVersion: engagement.stateVersion }) })} disabled={!signOffStatement.trim()}>Sign off / complete review</Button><Button type="button" variant="secondary" onClick={() => void post('/finalise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reportId: latestReport?.id, artifactVersion: engagement.signedOffArtifactVersion }) })} disabled={!latestReport?.id || !engagement.signedOffArtifactVersion}>Release exact signed-off version</Button><Button type="button" variant="secondary" onClick={() => void post('/transition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nextState: 'delivered', expectedStateVersion: engagement.stateVersion }) })} disabled={engagement.state !== 'review_complete'}>Mark delivered</Button></div></CardContent></Card>
  </div>;
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-mk-muted">{label}</p><p className="mt-1 font-semibold text-mk-ink">{value || 'Not recorded'}</p></div>; }

function EvidenceRow({ item, availableRefs, onSave }: { item: any; availableRefs: string[]; onSave: (status: string, observation: string, refs: string[]) => Promise<void> }) {
  const [status, setStatus] = useState(item.validationStatus);
  const [observation, setObservation] = useState(item.reviewerObservation ?? '');
  const [refs, setRefs] = useState<string[]>(item.analyticalEvidenceRefs ?? []);
  return <div className="rounded-xl border border-mk-line p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-mk-ink">{item.evidenceLabel || item.originalFilename}</strong><Badge>{item.validationStatus}</Badge></div><p className="mt-2 text-sm text-mk-muted">{item.contentType} · {Number(item.sizeBytes).toLocaleString()} bytes</p><div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end"><label className="text-sm font-semibold text-mk-ink">Classification<select className="mt-2 block w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal" value={status} onChange={(event) => setStatus(event.target.value)}>{evidenceStatuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="text-sm font-semibold text-mk-ink">Reviewer note<textarea className="mt-2 block min-h-12 w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal" value={observation} onChange={(event) => setObservation(event.target.value)} /></label><Button type="button" onClick={() => void onSave(status, observation, refs)}>Save evidence decision</Button></div><fieldset className="mt-4"><legend className="text-sm font-semibold text-mk-ink">Analytical evidence references actually examined</legend><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{availableRefs.map((ref) => <label key={ref} className="flex items-start gap-2 text-xs text-mk-muted"><input type="checkbox" checked={refs.includes(ref)} onChange={(event) => setRefs((current) => event.target.checked ? [...current, ref] : current.filter((value) => value !== ref))} />{ref}</label>)}</div></fieldset></div>;
}

function ReviewRecordEditor({ type, initial, subjects, availableRefs, onSave: persist }: { type: string; initial?: any; subjects: any[]; availableRefs: string[]; onSave: (payload: any) => Promise<unknown> }) {
  const [subjectKey, setSubjectKey] = useState(initial?.subjectKey ?? subjects[0]?.subjectKey ?? '');
  const subject = subjects.find((item) => item.subjectKey === subjectKey);
  const [conclusion, setConclusion] = useState(initial?.reviewerConclusion ?? (type === 'finding' ? 'REVIEWED' : ''));
  const [observation, setObservation] = useState(initial?.reviewerObservation ?? '');
  const [evidenceRefs, setEvidenceRefs] = useState<string[]>(initial?.evidenceRefs ?? []);
  const action = initial?.managementAction ?? {};
  const [extra, setExtra] = useState<Record<string, string>>({
    limitation: action.limitation ?? action.designGapLimitation ?? '',
    adjustedInterpretation: action.adjustedInterpretation ?? '',
    owner: action.owner ?? '',
    targetDate: action.targetDate ?? action.dueDate ?? '',
    managementResponse: action.managementResponse ?? '',
    assuranceStatement: action.assuranceStatement ?? '',
    confidence: action.confidence ?? 'MEDIUM',
    recommendedAdjustment: action.recommendedAdjustment ?? '',
    tradeoffs: Array.isArray(action.keyTradeOffs) ? action.keyTradeOffs.join('\n') : '',
    boardDecision: action.boardDecision ?? '',
    rationale: action.rationale ?? '',
    status: action.status ?? 'OPEN'
  });
  const [options, setOptions] = useState((initial?.decisionOptions ?? []).join('\n'));
  const [linkedFindingIds, setLinkedFindingIds] = useState<string[]>(action.linkedFindingIds ?? []);
  const [linkedRiskIds, setLinkedRiskIds] = useState<string[]>(action.linkedRiskIds ?? []);
  const subjectRefs = subject?.evidenceRefs ?? [];
  const onSave = evidenceRefs.length === 0 ? async () => undefined : persist;
  const setField = (key: string, value: string) => setExtra((current) => ({ ...current, [key]: value }));
  const toggle = (setter: (value: string[]) => void, current: string[], value: string) => setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  const managementAction = {
    ...action,
    ...(type === 'finding' ? { limitation: extra.limitation, adjustedInterpretation: extra.adjustedInterpretation, owner: extra.owner, dueDate: extra.targetDate, managementResponse: extra.managementResponse } : {}),
    ...(type === 'risk' ? { assuranceStatement: extra.assuranceStatement, limitation: extra.limitation, confidence: extra.confidence } : {}),
    ...(type === 'control_design' ? { designGapLimitation: extra.limitation, recommendedAdjustment: extra.recommendedAdjustment } : {}),
    ...(type === 'decision' ? { keyTradeOffs: extra.tradeoffs.split('\n').map((item: string) => item.trim()).filter(Boolean), boardDecision: extra.boardDecision, owner: extra.owner, targetDate: extra.targetDate } : {}),
    ...(type === 'management_action' ? { rationale: extra.rationale, linkedFindingIds, linkedRiskIds, owner: extra.owner, targetDate: extra.targetDate, status: extra.status, managementResponse: extra.managementResponse } : {})
  };
  return <div className="rounded-xl border border-mk-line bg-mk-paper/40 p-4"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold capitalize text-mk-ink">{initial ? `Existing ${type.replaceAll('_', ' ')}` : `New ${type.replaceAll('_', ' ')}`}</h3><Badge>{initial ? `v${initial.recordVersion}` : 'not saved'}</Badge></div><div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-sm font-semibold text-mk-ink">Current analytical subject<select className="mt-2 block w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal" value={subjectKey} onChange={(event) => setSubjectKey(event.target.value)} disabled={!subjects.length}><option value="">Choose a current subject</option>{subjects.map((item: any) => <option key={item.subjectKey} value={item.subjectKey}>{item.subjectKey} · {item.title}</option>)}</select></label><label className="text-sm font-semibold text-mk-ink">{type === 'finding' ? 'Conclusion' : type === 'risk' ? 'Interpretation' : type === 'control_design' ? 'Design assessment' : type === 'decision' ? 'Reviewer recommendation' : 'Action / decision'}<textarea className="mt-2 min-h-16 w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal" value={conclusion} onChange={(event) => setConclusion(event.target.value)} /></label></div>{subject ? <p className="mt-3 rounded-lg bg-white p-3 text-sm text-mk-muted"><strong className="text-mk-ink">{subject.title}</strong> · {subject.detail}{subject.domain ? ` · ${subject.domain}` : ''}{subject.priority ? ` · ${subject.priority}` : ''}</p> : null}{type === 'finding' ? <div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-sm font-semibold text-mk-ink">Finding conclusion<select className="mt-2 block w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal" value={conclusion} onChange={(event) => setConclusion(event.target.value)}><option>SUPPORTED</option><option>NOT_SUPPORTED</option><option>INSUFFICIENT</option><option>NOT_APPLICABLE</option><option>REVIEWED</option></select></label><TextField label="Reviewer observation" value={observation} onChange={setObservation} /><TextField label="Limitation" value={extra.limitation} onChange={(value) => setField('limitation', value)} /><TextField label="Adjusted interpretation" value={extra.adjustedInterpretation} onChange={(value) => setField('adjustedInterpretation', value)} /><TextField label="Owner" value={extra.owner} onChange={(value) => setField('owner', value)} /><TextField label="Due date" value={extra.targetDate} onChange={(value) => setField('targetDate', value)} /><TextField label="Management response" value={extra.managementResponse} onChange={(value) => setField('managementResponse', value)} /></div> : null}{type === 'risk' ? <div className="mt-3 grid gap-3 md:grid-cols-2"><TextField label="Interpretation" value={conclusion} onChange={setConclusion} /><TextField label="Assurance / qualification" value={extra.assuranceStatement} onChange={(value) => setField('assuranceStatement', value)} /><TextField label="Limitation" value={extra.limitation} onChange={(value) => setField('limitation', value)} /><TextField label="Confidence" value={extra.confidence} onChange={(value) => setField('confidence', value)} /></div> : null}{type === 'control_design' ? <div className="mt-3 grid gap-3 md:grid-cols-2"><TextField label="Design assessment" value={conclusion} onChange={setConclusion} /><TextField label="Design gap / limitation" value={extra.limitation} onChange={(value) => setField('limitation', value)} /><TextField label="Reviewer observation" value={observation} onChange={setObservation} /><TextField label="Recommended adjustment" value={extra.recommendedAdjustment} onChange={(value) => setField('recommendedAdjustment', value)} /></div> : null}{type === 'decision' ? <div className="mt-3 grid gap-3 md:grid-cols-2"><TextField label="Reviewer recommendation" value={observation} onChange={setObservation} /><TextField label="Trade-offs (one per line)" value={extra.tradeoffs} onChange={(value) => setField('tradeoffs', value)} /><TextField label="Management / board decision" value={extra.boardDecision} onChange={(value) => setField('boardDecision', value)} /><TextField label="Owner" value={extra.owner} onChange={(value) => setField('owner', value)} /><TextField label="Target date" value={extra.targetDate} onChange={(value) => setField('targetDate', value)} /><TextField label="Viable options (one per line)" value={options} onChange={setOptions} /></div> : null}{type === 'management_action' ? <div className="mt-3 grid gap-3 md:grid-cols-2"><TextField label="Rationale" value={extra.rationale} onChange={(value) => setField('rationale', value)} /><TextField label="Owner" value={extra.owner} onChange={(value) => setField('owner', value)} /><TextField label="Target date" value={extra.targetDate} onChange={(value) => setField('targetDate', value)} /><TextField label="Management response" value={extra.managementResponse} onChange={(value) => setField('managementResponse', value)} /><TextField label="Status" value={extra.status} onChange={(value) => setField('status', value)} /><TextField label="Action / decision" value={conclusion} onChange={setConclusion} /></div> : null}{subjectRefs.length ? <fieldset className="mt-4"><legend className="text-sm font-semibold text-mk-ink">Evidence references actually reviewed for this subject</legend><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{subjectRefs.map((ref: string) => <label key={ref} className="flex items-start gap-2 text-xs text-mk-muted"><input type="checkbox" checked={evidenceRefs.includes(ref)} onChange={() => toggle(setEvidenceRefs, evidenceRefs, ref)} />{ref}</label>)}</div></fieldset> : <p className="mt-4 text-sm text-mk-muted">No linked analytical evidence reference exists for this subject.</p>}<Button className="mt-4" type="button" onClick={() => void onSave({ recordType: type, subjectKey, reviewerConclusion: conclusion, reviewerObservation: observation, evidenceRefs, decisionOptions: options.split('\n').map((item: string) => item.trim()).filter(Boolean), managementAction, expectedVersion: initial?.recordVersion ?? null })} disabled={!subjectKey || !conclusion.trim()}>Save {type.replaceAll('_', ' ')}</Button></div>;
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-sm font-semibold text-mk-ink">{label}<textarea className="mt-2 min-h-12 w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal" value={value} onChange={(event) => onChange(event.target.value)} /></label>; }

#!/usr/bin/env node
/**
 * Owner-acceptance pilot journey driver.
 *
 * Runs the real adaptive assessment journey through the same server functions the
 * customer HTTP routes call: start, save gateway answers, save control responses,
 * submit. No scoring, no report, no provider call.
 *
 * Answers are supplied by a persona file, never generated here. This script has no
 * answer-selection logic of its own by design — it applies what the persona states
 * and nothing else.
 *
 * Modes:
 *   start   PERSONA=<id>            create org + respondent + assessment
 *   gateway REF=<ref> TOKEN=<t>     save gateway answers, dump applicable questions
 *   answer  REF=<ref> TOKEN=<t>     save control responses from the persona
 *   submit  REF=<ref> TOKEN=<t>     submit the assessment
 */
import fs from 'node:fs';
import path from 'node:path';
import { startAdaptiveAssessment, saveAdaptiveAssessmentState, getAdaptiveAssessmentState, submitAdaptiveAssessment } from '../../src/lib/adaptive/server.ts';

const MODE = process.argv[2];
const PERSONA_FILE = process.env.PERSONA_FILE ?? 'outputs/product-owner-acceptance/personas.json';
const STATE_FILE = process.env.STATE_FILE ?? 'outputs/product-owner-acceptance/journey-state.json';

const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

const personas = readJson(PERSONA_FILE, {});
const state = readJson(STATE_FILE, {});

async function start(personaId) {
  const persona = personas[personaId];
  if (!persona) throw new Error(`No persona ${personaId}`);
  const result = await startAdaptiveAssessment({
    fullName: persona.respondent.fullName,
    email: persona.respondent.email,
    roleTitle: persona.respondent.roleTitle,
    organisationName: persona.organisation.legalName,
    tradingName: persona.organisation.tradingName,
    industry: persona.organisation.industry,
    sector: persona.organisation.sector,
    province: persona.organisation.province,
    employeeBand: persona.organisation.employeeBand,
    annualRevenueBand: persona.organisation.annualRevenueBand,
    consentPrivacy: true,
    consentResearch: false
  }, 'http://localhost:3000');
  const token = new URL(result.resumeUrl).searchParams.get('token');
  state[personaId] = { ...result, token, personaId, stage: 'started' };
  writeJson(STATE_FILE, state);
  console.log(`${personaId} ${result.assessmentReference}`);
  return state[personaId];
}

async function gateway(personaId) {
  const entry = state[personaId];
  const persona = personas[personaId];
  const before = await getAdaptiveAssessmentState(entry.assessmentReference, entry.token);
  const seq = before.publicState.navigation?.save_sequence ?? 0;
  const saved = await saveAdaptiveAssessmentState({
    assessmentReference: entry.assessmentReference, token: entry.token, expectedSaveSequence: seq,
    currentScreen: 'question', currentQuestionId: null,
    visitedQuestionIds: Object.keys(persona.gatewayAnswers),
    gatewayAnswers: persona.gatewayAnswers, controlResponses: {}, confirmGatewayChange: true
  });
  if (!saved.ok) throw new Error(`${personaId} gateway save failed: ${JSON.stringify(saved.errors ?? saved)}`);
  const after = await getAdaptiveAssessmentState(entry.assessmentReference, entry.token);
  const p = after.publicState.path ?? {};
  entry.stage = 'gateways';
  entry.applicableCount = p.applicableCount;
  entry.unanswered = p.unansweredApplicableCount;
  writeJson(STATE_FILE, state);
  console.log(`${personaId} applicable=${p.applicableCount} unanswered=${p.unansweredApplicableCount}`);
  return after.publicState;
}

async function dumpQuestions(personaId, outFile) {
  const entry = state[personaId];
  const s = (await getAdaptiveAssessmentState(entry.assessmentReference, entry.token)).publicState;
  writeJson(outFile, s);
  console.log(`wrote ${outFile}`);
}

async function answer(personaId) {
  const entry = state[personaId];
  const persona = personas[personaId];
  const responses = persona.controlResponses;
  if (!responses || !Object.keys(responses).length) throw new Error(`${personaId} has no controlResponses`);
  const before = await getAdaptiveAssessmentState(entry.assessmentReference, entry.token);
  const seq = before.publicState.navigation?.save_sequence ?? 0;
  const saved = await saveAdaptiveAssessmentState({
    assessmentReference: entry.assessmentReference, token: entry.token, expectedSaveSequence: seq,
    currentScreen: 'review', currentQuestionId: null,
    visitedQuestionIds: Object.keys(responses),
    gatewayAnswers: persona.gatewayAnswers, controlResponses: responses, confirmGatewayChange: false
  });
  if (!saved.ok) throw new Error(`${personaId} answer save failed: ${JSON.stringify(saved.errors ?? saved)}`);
  const after = await getAdaptiveAssessmentState(entry.assessmentReference, entry.token);
  const p = after.publicState.path ?? {};
  entry.stage = 'answered';
  entry.unanswered = p.unansweredApplicableCount;
  writeJson(STATE_FILE, state);
  console.log(`${personaId} answered, unanswered=${p.unansweredApplicableCount}`);
}

async function submit(personaId) {
  const entry = state[personaId];
  const before = await getAdaptiveAssessmentState(entry.assessmentReference, entry.token);
  const seq = before.publicState.navigation?.save_sequence ?? 0;
  const result = await submitAdaptiveAssessment(entry.assessmentReference, entry.token, seq);
  if (!result.ok) throw new Error(`${personaId} submit failed: ${JSON.stringify(result.errors ?? result)}`);
  entry.stage = 'submitted';
  entry.submittedAt = result.submittedAt;
  writeJson(STATE_FILE, state);
  console.log(`${personaId} submitted at ${result.submittedAt}`);
}

const id = process.env.PERSONA;
if (MODE === 'start') await start(id);
else if (MODE === 'gateway') await gateway(id);
else if (MODE === 'dump') await dumpQuestions(id, process.env.OUT ?? 'outputs/product-owner-acceptance/state-dump.json');
else if (MODE === 'answer') await answer(id);
else if (MODE === 'submit') await submit(id);
else throw new Error(`Unknown mode ${MODE}`);

// Release B worker-schedule certification gate.
//
// This is NOT part of ordinary preview builds or PR CI while the project remains on a Vercel
// Hobby plan -- run it manually during the integrated release-candidate / production-
// certification cycle, after the Vercel plan decision (docs/safe-launch/12-durable-fulfilment-
// design.md, "Vercel plan launch gate") has been made. Wiring this into every preview build
// today would fail every deployment, since 0 3 * * * (the current, deliberately temporary,
// Hobby-compatible schedule) is BELOW the certified production interval by design.
//
// What this script does NOT do, and cannot do: it does not know, check, or infer the Vercel
// account's plan tier. That must be confirmed independently through release evidence (a real
// deployment attempt, or the Vercel dashboard/API), not guessed from vercel.json or any other
// file in this repository. This script only checks the *schedule expression itself* against the
// certified production requirement.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const EXPECTED_WORKER_PATH = '/score/api/internal/fulfilment-worker';
// Certified production maximum pickup interval, per docs/safe-launch/12-durable-fulfilment-
// design.md ("Cron schedule status"): every one to two minutes, subject to final performance
// testing. Expressed here as a ceiling in minutes -- a schedule with a coarser interval than
// this fails certification.
const MAX_CERTIFIED_INTERVAL_MINUTES = 2;
// The known temporary, Hobby-compatible recovery schedule. If vercel.json still has exactly
// this, certification must fail clearly and explain why, not pass silently.
const TEMPORARY_HOBBY_SCHEDULE = '0 3 * * *';

function fail(message) {
  console.error(`CERTIFICATION FAILED: ${message}`);
  process.exitCode = 1;
}

function readVercelJson() {
  const file = path.join(root, 'vercel.json');
  if (!fs.existsSync(file)) {
    fail('vercel.json does not exist.');
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`vercel.json is not valid JSON: ${error.message}`);
    return null;
  }
}

// Parses the minute field of a 5-field cron expression and returns the implied interval in
// minutes for simple step (*/N) or fixed-minute (single value) forms. Returns null (meaning
// "cannot certify as sub-daily from the minute field alone, needs the coarser fields checked
// too") for anything more complex -- this is deliberately conservative, not a general cron
// parser: a false "cannot certify" is safe, a false "certified" is not.
function impliedIntervalMinutes(cronExpression) {
  const fields = cronExpression.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;

  if (hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const stepMatch = minute.match(/^\*\/(\d+)$/);
    if (stepMatch) return Number(stepMatch[1]);
    if (/^\d+$/.test(minute)) return 60; // fixed minute, every hour
  }
  // A single fixed hour/day (e.g. "0 3 * * *") is at most once per day -- certainly not
  // sub-daily at the certified interval, regardless of exact classification.
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 24 * 60;
  }
  return null;
}

function main() {
  console.log('Release B worker-schedule certification gate');
  console.log('=============================================');
  console.log('This checks the cron SCHEDULE only. It does NOT check the Vercel account plan.');
  console.log('The plan itself must be confirmed independently -- see docs/safe-launch/09-release-evidence.md');
  console.log('and the "Vercel plan launch gate" in docs/safe-launch/12-durable-fulfilment-design.md.\n');

  const config = readVercelJson();
  if (!config) return;

  const crons = Array.isArray(config.crons) ? config.crons : [];
  const entry = crons.find((c) => c && c.path === EXPECTED_WORKER_PATH);

  if (!entry) {
    fail(`No cron entry found for ${EXPECTED_WORKER_PATH} in vercel.json. Found paths: ${crons.map((c) => c.path).join(', ') || '(none)'}`);
    return;
  }
  console.log(`ok - cron entry exists for the worker path (${EXPECTED_WORKER_PATH})`);

  const schedule = String(entry.schedule ?? '');
  if (!schedule) {
    fail('Cron entry has no schedule field.');
    return;
  }

  if (schedule === TEMPORARY_HOBBY_SCHEDULE) {
    fail(
      `vercel.json still has the temporary, development-only Hobby-compatible schedule (${TEMPORARY_HOBBY_SCHEDULE}). ` +
      'This is explicitly NOT the approved production schedule (see docs/safe-launch/12-durable-fulfilment-design.md, ' +
      '"Cron schedule status"). Do not treat a passing deployment on this schedule as production-ready. ' +
      'Update to the certified interval only AFTER the Vercel plan launch gate is satisfied.'
    );
    return;
  }

  const interval = impliedIntervalMinutes(schedule);
  if (interval === null) {
    fail(
      `Could not classify the schedule "${schedule}" as sub-daily using this script's conservative check. ` +
      'Manually confirm it against the certified interval before proceeding -- do not assume it passes.'
    );
    return;
  }
  if (interval > MAX_CERTIFIED_INTERVAL_MINUTES) {
    fail(
      `Schedule "${schedule}" implies an interval of ~${interval} minute(s), which exceeds the certified ` +
      `maximum production pickup interval of ${MAX_CERTIFIED_INTERVAL_MINUTES} minute(s). Not certified.`
    );
    return;
  }

  console.log(`ok - schedule "${schedule}" implies an interval of ~${interval} minute(s), within the certified ${MAX_CERTIFIED_INTERVAL_MINUTES}-minute maximum`);
  console.log('\nSchedule expression certified. This does NOT certify:');
  console.log('  - that the current Vercel account plan can actually deploy this schedule (Hobby plans cannot);');
  console.log('  - that cron has been observed to actually invoke the worker in production (preview deployments never run cron);');
  console.log('  - measured worker runtime against the production function duration limit.');
  console.log('Confirm all three independently through release evidence before treating Release B as production-ready.');
}

main();

import crypto from 'node:crypto';

function digest(secret: string, value: string) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function equalSafe(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function buildReadinessSignature(secret: string, method: string, pathname: string) {
  return digest(secret, `${method.toUpperCase()}:${pathname}`);
}

export function verifyReadinessRequest(request: Request, secret: string | undefined, pathname: string) {
  if (!secret?.trim()) return false;
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer && equalSafe(bearer, secret.trim())) return true;
  const signature = request.headers.get('x-mk-monitor-signature')?.trim();
  return Boolean(signature && equalSafe(signature, buildReadinessSignature(secret.trim(), request.method, pathname)));
}

export function buildSyntheticMonitorHeader(secret: string, runId: string) {
  return `${runId}.${digest(secret, `synthetic:${runId}`)}`;
}

export function verifySyntheticMonitorHeader(header: string | null, secret: string | undefined) {
  if (!secret?.trim() || !header) return null;
  const separator = header.lastIndexOf('.');
  if (separator <= 0) return null;
  const runId = header.slice(0, separator);
  const signature = header.slice(separator + 1);
  if (!/^[A-Za-z0-9._:-]{1,100}$/.test(runId) || !signature) return null;
  return equalSafe(signature, digest(secret.trim(), `synthetic:${runId}`)) ? runId : null;
}

export function isAuthorisedSyntheticMonitorRequest(request: Request, env: NodeJS.ProcessEnv = process.env) {
  return verifySyntheticMonitorHeader(
    request.headers.get('x-mk-synthetic-monitor-run'),
    env.MK_SYNTHETIC_MONITOR_SECRET
  );
}


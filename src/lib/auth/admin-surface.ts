/**
 * Containment of the operator console to deployment-protected hosts (independent review, section 5, security finding).
 *
 * This is containment, not authentication. It does not identify the operator, assign the operator's own role or
 * correct audit attribution: the console still acts as the profile getAdminSession() selects. Person-bound sign-in is
 * a separate owner decision (DR-08) and a separately reviewed change.
 *
 * The console's routes resolve their actor with getAdminSession(), which binds to the highest-priority active admin
 * profile without reference to the requesting person. The operating model MK chose (13 November 2026: no passwords, no
 * MFA, no test logins) relies on Vercel Authentication to keep everyone else out. The project's protection scope is
 * `all_except_custom_domains`, so that boundary covers Vercel's own hosts and not mkfraud.co.za or www.mkfraud.co.za.
 *
 * The console answers only on an exact list of hosts and returns a plain 404 everywhere else:
 *   - the hosts Vercel assigns to the running deployment itself (VERCEL_URL and VERCEL_BRANCH_URL), which the current
 *     protection scope covers. ASSUMPTION: the project's protection stays `all` or `all_except_custom_domains`; if it is
 *     ever reduced, these hosts must be removed (set MK_ADMIN_TRUST_DEPLOYMENT_HOSTS=0);
 *   - hosts the owner lists exactly in MK_ADMIN_ALLOWED_HOSTS after verifying their protection (for example the stable
 *     production alias mk-fraud-platform-tondanis-projects.vercel.app);
 *   - a local development host, only when not running on Vercel.
 * No suffix is trusted: an arbitrary *.vercel.app name is not evidence of protection. With no configuration the console
 * is reachable only on the deployment's own hosts; with MK_ADMIN_TRUST_DEPLOYMENT_HOSTS=0 and no list, nowhere.
 */
export const ADMIN_SURFACE_VERSION = 'admin-surface-gate-1.1';

/** Paths whose handlers resolve an actor with getAdminSession() or render the operator console (reads and writes). */
export function isAdminSurface(pathname: string): boolean {
  return pathname === '/score/admin' || pathname.startsWith('/score/admin/')
    || pathname === '/score/api/admin' || pathname.startsWith('/score/api/admin/')
    || /^\/score\/api\/commercial\/orders\/[^/]+\/?$/.test(pathname);
}

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const clean = (h: string) => h.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');

/** The exact hosts on which the console may answer in this environment. */
export function adminAllowedHosts(env: Record<string, string | undefined> = process.env): Set<string> {
  const hosts = new Set<string>();
  if (env.MK_ADMIN_TRUST_DEPLOYMENT_HOSTS !== '0') {
    for (const v of [env.VERCEL_URL, env.VERCEL_BRANCH_URL]) {
      const h = v ? clean(v) : '';
      // Only a host Vercel generated for this deployment, never a custom domain that happens to be configured.
      if (h.endsWith('.vercel.app')) hosts.add(h);
    }
  }
  for (const h of (env.MK_ADMIN_ALLOWED_HOSTS ?? '').split(',').map(clean).filter(Boolean)) hosts.add(h);
  return hosts;
}

export function adminHostAllowed(hostname: string, env: Record<string, string | undefined> = process.env): boolean {
  const host = clean(hostname);
  if (!host) return false;
  if (LOCAL.has(host)) return env.VERCEL !== '1';
  return adminAllowedHosts(env).has(host);
}

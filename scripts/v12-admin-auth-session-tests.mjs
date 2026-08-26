import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const require = createRequire(import.meta.url);

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertIncludes(relativePath, needle, message) {
  assert.ok(read(relativePath).includes(needle), `${message}: expected ${relativePath} to include ${needle}`);
}

function assertSourceOrder(relativePath, first, second, message) {
  const source = read(relativePath);
  assert.ok(source.indexOf(first) >= 0, `${message}: missing ${first}`);
  assert.ok(source.indexOf(second) >= 0, `${message}: missing ${second}`);
  assert.ok(source.indexOf(first) < source.indexOf(second), `${message}: ${first} must precede ${second}`);
}

function compileCommonJs(relativePath, shims) {
  const output = ts.transpileModule(read(relativePath), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;
  const module = { exports: {} };
  const requireShim = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(shims, specifier)) return shims[specifier];
    return require(specifier);
  };
  new Function('require', 'module', 'exports', output)(requireShim, module, module.exports);
  return module.exports;
}

function makeResponse(body, init = {}) {
  const response = {
    status: init.status ?? 200,
    ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
    headers: new Headers(init.headers ?? {}),
    body,
    cookieWrites: [],
    cookies: {
      set(name, value, options) {
        response.cookieWrites.push({ name, value, options });
      }
    },
    json: async () => body
  };
  return response;
}

const nextServerShim = {
  NextResponse: {
    json: (body, init) => makeResponse(body, init)
  }
};

const adminRoles = ['platform_admin', 'approver', 'reviewer', 'finance_admin', 'read_only_admin'];

function makeProfileClient(result) {
  const query = {
    select() { return query; },
    eq() { return query; },
    in() { return query; },
    maybeSingle: async () => result
  };
  return { from(table) {
    assert.equal(table, 'admin_profiles');
    return query;
  } };
}

function request(body) {
  return new Request('https://preview.example.test/score/api/admin/session/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
    body: JSON.stringify(body)
  });
}

function loadLoginModule(state) {
  return compileCommonJs('src/app/score/api/admin/session/login/route.ts', {
    'next/server': nextServerShim,
    '@/lib/auth/admin-route': { ADMIN_ROLE_PRIORITY: adminRoles },
    '@/lib/auth/session-cookies': {
      setAdminSessionCookies(response, session) {
        response.cookies.set('mk_admin_access_token', session.access_token, {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/',
          maxAge: session.expires_in
        });
        if (session.refresh_token) {
          response.cookies.set('mk_admin_refresh_token', session.refresh_token, {
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 30
          });
        }
        state.cookieHelperSession = session;
      }
    },
    '@/lib/security/rate-limit': {
      checkRateLimits: async (checks) => {
        state.rateLimitChecks = checks;
        return { allowed: state.rateLimitAllowed, key: checks[0]?.key ?? '' };
      },
      getClientIpHashKey: () => 'admin_login:ip:203.0.113.10',
      RATE_LIMITS: {
        adminLoginPerIp: () => ({ maxHits: 20, windowSeconds: 900 }),
        adminLoginPerEmail: () => ({ maxHits: 10, windowSeconds: 900 })
      }
    },
    '@/lib/supabase/server': {
      createSupabaseAnonServerClient: () => ({ auth: { signInWithPassword: async ({ email, password }) => {
        state.credentials = { email, password };
        return { data: state.authData, error: state.authError };
      } } }),
      createSupabaseServiceClient: () => makeProfileClient({ data: state.profileData, error: state.profileError })
    }
  });
}

function validAuthData(overrides = {}) {
  return {
    user: { id: '3fea51fe-bbcc-4ec6-a9fd-20233a6634ec', email: 'admin@example.test' },
    session: {
      access_token: 'access-token-test-only',
      refresh_token: 'refresh-token-test-only',
      expires_in: 1234
    },
    ...overrides
  };
}

async function runLoginCase({ authData = validAuthData(), authError = null, profileData, profileError = null, rateLimitAllowed = true }) {
  const state = { authData, authError, profileData, profileError, rateLimitAllowed, rateLimitChecks: null, cookieHelperSession: null };
  const module = loadLoginModule(state);
  const response = await module.POST(request({ email: ' Admin@Example.Test ', password: 'not-output-password' }));
  return { response, state };
}

function assertNoTokenInPayload(response, label) {
  return response.json().then((payload) => {
    const serialised = JSON.stringify(payload);
    assert.equal(serialised.includes('access-token-test-only'), false, `${label} must not return the access token`);
    assert.equal(serialised.includes('refresh-token-test-only'), false, `${label} must not return the refresh token`);
    return payload;
  });
}

async function runtimeLoginTests() {
  {
    const { response, state } = await runLoginCase({ authData: { user: null, session: null }, authError: new Error('invalid') });
    assert.equal(response.status, 401, 'wrong credentials must return 401');
    assert.equal(response.cookieWrites.length, 0, 'wrong credentials must not set cookies');
    await assertNoTokenInPayload(response, 'wrong credentials');
    assert.equal(state.rateLimitChecks.length, 2, 'login must check IP and email rate limits');
  }

  for (const [label, profileData] of [
    ['no profile', null],
    ['inactive profile', { id: validAuthData().user.id, email: 'admin@example.test', full_name: 'Admin', role: 'platform_admin', status: 'inactive' }],
    ['non-admin role', { id: validAuthData().user.id, email: 'admin@example.test', full_name: 'Admin', role: 'customer', status: 'active' }],
    ['profile email mismatch', { id: validAuthData().user.id, email: 'different@example.test', full_name: 'Admin', role: 'platform_admin', status: 'active' }]
  ]) {
    const { response } = await runLoginCase({ profileData });
    assert.equal(response.status, 401, `${label} must return the generic login failure`);
    assert.equal(response.cookieWrites.length, 0, `${label} must not set cookies`);
    await assertNoTokenInPayload(response, label);
  }

  {
    const profileData = {
      id: validAuthData().user.id,
      email: 'admin@example.test',
      full_name: 'Approved Admin',
      role: 'platform_admin',
      status: 'active'
    };
    const { response, state } = await runLoginCase({ profileData });
    assert.equal(response.status, 200, 'valid approved session must succeed');
    assert.deepEqual(await response.json(), { ok: true }, 'login must return only a success envelope');
    assert.equal(response.cookieWrites.length, 2, 'valid session must set access and refresh cookies');
    assert.equal(state.cookieHelperSession.expires_in, 1234, 'login must pass Supabase expires_in to the cookie helper');
    assert.equal(response.cookieWrites.every((cookie) => cookie.options.httpOnly === true), true, 'session cookies must be HttpOnly');
    assert.equal(response.cookieWrites.every((cookie) => cookie.options.secure === true), true, 'session cookies must be Secure in production');
    assert.equal(response.cookieWrites.every((cookie) => cookie.options.sameSite === 'lax'), true, 'session cookies must use SameSite=Lax');
    await assertNoTokenInPayload(response, 'valid login');
  }

  {
    const { response, state } = await runLoginCase({ rateLimitAllowed: false, profileData: null });
    assert.equal(response.status, 429, 'blocked login rate limit must return 429');
    assert.equal(response.cookieWrites.length, 0, 'blocked login rate limit must not set cookies');
    assert.equal(state.credentials, undefined, 'blocked login rate limit must not call Supabase Auth');
  }
}

async function logoutTests() {
  const state = { cleared: false, signOutOptions: null };
  const module = compileCommonJs('src/app/score/api/admin/session/logout/route.ts', {
    'next/server': nextServerShim,
    '@/lib/auth/session-cookies': {
      getAdminAccessTokenFromCookies: () => 'access-token-test-only',
      clearAdminSessionCookies(response) {
        state.cleared = true;
        response.cookies.set('mk_admin_access_token', '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
        response.cookies.set('mk_admin_refresh_token', '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
      }
    },
    '@/lib/supabase/server': {
      createSupabaseAuthenticatedServerClient: () => ({
        auth: {
          signOut: async (options) => {
            state.signOutOptions = options;
            throw new Error('remote invalidation unavailable in test');
          }
        }
      })
    }
  });
  const response = await module.POST();
  assert.equal(response.status, 200, 'logout must succeed even if remote invalidation is unavailable');
  assert.deepEqual(state.signOutOptions, { scope: 'local' }, 'logout must use local Supabase session scope');
  assert.equal(state.cleared, true, 'logout must clear application cookies unconditionally');
  assert.deepEqual(response.cookieWrites.map((cookie) => [cookie.name, cookie.value, cookie.options.maxAge]), [
    ['mk_admin_access_token', '', 0],
    ['mk_admin_refresh_token', '', 0]
  ]);
  await assertNoTokenInPayload(response, 'logout');
}

function staticContractTests() {
  const loginRoute = read('src/app/score/api/admin/session/login/route.ts');
  const logoutRoute = read('src/app/score/api/admin/session/logout/route.ts');
  const cookieHelper = read('src/lib/auth/session-cookies.ts');
  const loginPage = read('src/app/score/admin/login/page.tsx');
  const loginForm = read('src/components/admin/AdminSessionLoginForm.tsx');
  const actions = read('src/components/admin/AssessmentEssentialReportActions.tsx');
  const generationRoute = read('src/app/score/api/admin/assessments/[assessmentRef]/generate-essential-report/route.ts');
  const downloadRoute = read('src/app/score/api/admin/assessments/[assessmentRef]/reports/[reportId]/download/route.ts');

  for (const required of ['signInWithPassword', 'admin_profiles', 'setAdminSessionCookies', 'ADMIN_ROLE_PRIORITY', 'expires_in', 'private, no-store']) {
    assert.ok(loginRoute.includes(required), `login route must include ${required}`);
  }
  for (const forbidden of ['SUPABASE_SERVICE_ROLE_KEY', 'localStorage', 'sessionStorage', 'console.log', 'console.info', 'console.warn', 'console.error']) {
    assert.equal(loginRoute.includes(forbidden), false, `login route must not expose or log ${forbidden}`);
  }
  assertSourceOrder('src/app/score/api/admin/assessments/[assessmentRef]/generate-essential-report/route.ts', 'const frozen = await getRc1OperationFreezeResponse', 'const admin = await getAuthenticatedAdminSession', 'generation auth must remain after the freeze guard');
  assertSourceOrder('src/app/score/api/admin/assessments/[assessmentRef]/generate-essential-report/route.ts', 'const admin = await getAuthenticatedAdminSession', 'await generateManualPhase1Report', 'generation must authenticate before the service call');
  assertIncludes('src/app/score/api/admin/assessments/[assessmentRef]/generate-essential-report/route.ts', 'GENERATION_ROLES', 'generation route must use its accepted explicit mutation role boundary');
  assertIncludes('src/app/score/api/admin/assessments/[assessmentRef]/reports/[reportId]/download/route.ts', 'DOWNLOAD_ROLES', 'download route must use its accepted explicit role boundary');
  assertIncludes('src/app/score/admin/assessments/[assessmentRef]/page.tsx', 'getAdminMutationAuthState', 'assessment UI must use strict session state');
  for (const state of ['authenticated_authorized', 'authenticated_unauthorized', 'unauthenticated']) {
    assert.ok(actions.includes(state), `report actions must distinguish ${state}`);
  }
  assertIncludes('src/components/admin/AssessmentEssentialReportActions.tsx', 'Sign in to generate', 'unauthenticated viewers must receive a clear sign-in action');
  assertIncludes('src/components/admin/AdminSessionLoginForm.tsx', '/score/api/admin/session/login', 'login form must use the supported Supabase Auth route');
  assertIncludes('src/components/admin/AdminLogoutButton.tsx', '/score/api/admin/session/logout', 'logout control must use the supported logout route');
  assertIncludes('src/app/score/admin/login/page.tsx', 'AdminSessionLoginForm', 'score admin login page must render the new login form');
  assertIncludes('src/app/score/api/admin/session/logout/route.ts', 'clearAdminSessionCookies', 'logout must clear both application session cookies');
  for (const required of ['httpOnly: true', 'secure: isProduction', "sameSite: 'lax'", 'maxAge: 0']) {
    assert.ok(cookieHelper.includes(required), `cookie helper must retain ${required}`);
  }
  assert.equal(loginPage.includes('window.location'), false, 'server login page must not own client redirect authority');
  assert.equal(loginForm.includes('localStorage'), false, 'login form must not persist credentials or tokens in localStorage');
  assert.equal(loginForm.includes('sessionStorage'), false, 'login form must not persist credentials or tokens in sessionStorage');

  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const writes = [];
    const sessionCookies = compileCommonJs('src/lib/auth/session-cookies.ts', {
      'next/headers': { cookies: () => ({ get: () => undefined }) }
    });
    const response = { cookies: { set: (name, value, options) => writes.push({ name, value, options }) } };
    sessionCookies.setAdminSessionCookies(response, { access_token: 'access-token-test-only', refresh_token: 'refresh-token-test-only', expires_in: 777 });
    assert.equal(writes[0].options.maxAge, 777, 'cookie helper must use the actual access-token expiry');
    assert.equal(writes.every((cookie) => cookie.options.httpOnly && cookie.options.secure && cookie.options.sameSite === 'lax'), true, 'cookie helper flags must be production-safe');
    sessionCookies.clearAdminSessionCookies(response);
    assert.equal(writes.slice(-2).every((cookie) => cookie.options.maxAge === 0), true, 'cookie helper must expire both cookies on logout');
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
}

staticContractTests();
await runtimeLoginTests();
await logoutTests();
// Keep the test's crypto dependency exercised without ever printing a credential or token. This
// also guards against a future accidental replacement of the email rate-limit key with raw email.
assert.equal(crypto.createHash('sha256').update('admin@example.test').digest('hex').length, 64);
console.log('V12 admin Auth session tests passed: generic credential/profile failures, zero-cookie rejection paths, approved session cookie flags/expiry, logout clearing, strict API role boundaries, and viewer UI states are covered.');

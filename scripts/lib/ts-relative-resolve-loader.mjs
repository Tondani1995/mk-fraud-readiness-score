// Minimal Node ESM resolve hook so `node --experimental-strip-types` can run test scripts that
// import real source files with extensionless relative specifiers (e.g. `./contradictions`), which
// is how src/lib/reports/**/*.ts is written throughout this repo (correct under TypeScript/Next.js
// module resolution, but not resolvable by Node's native ESM loader without an extension).
//
// This is deliberately narrow: it only appends `.ts` to a relative specifier when the plain
// resolution fails, and only for specifiers that don't already have an extension. It does not
// transform, bundle, or reinterpret anything -- the actual TypeScript stripping is still done by
// Node's own --experimental-strip-types flag. This exists so committed tests can import and
// execute the real, compiled report-engine source directly (per this repo's existing test
// convention -- see scripts/phase14-report-access-eligibility-tests.mjs) rather than relying on a
// standalone, uncommitted resolve hook, which is what this replaces (see PR #37 history: "a
// standalone Node smoke test ... and a custom ESM resolve hook, not committed").
// Mirrors tsconfig.json's single path alias: "@/*" -> "./src/*". Not a general tsconfig-paths
// implementation -- this repo only defines the one alias, so that's all this resolves.
const ALIAS_PREFIX = '@/';
const ALIAS_TARGET = new URL('../../src/', import.meta.url); // scripts/lib/ -> repo root -> src/

export async function resolve(specifier, context, nextResolve) {
  let effectiveSpecifier = specifier;
  if (specifier.startsWith(ALIAS_PREFIX)) {
    effectiveSpecifier = new URL(specifier.slice(ALIAS_PREFIX.length), ALIAS_TARGET).href;
  }

  try {
    return await nextResolve(effectiveSpecifier, context);
  } catch (error) {
    const isRelative = effectiveSpecifier.startsWith('./') || effectiveSpecifier.startsWith('../') || effectiveSpecifier.startsWith('file://');
    const hasExtension = /\.[a-zA-Z0-9]+$/.test(effectiveSpecifier);
    if (isRelative && !hasExtension && error?.code === 'ERR_MODULE_NOT_FOUND') {
      return nextResolve(`${effectiveSpecifier}.ts`, context);
    }
    if (isRelative && error?.code === 'ERR_UNSUPPORTED_DIR_IMPORT') {
      return nextResolve(`${effectiveSpecifier}/index.ts`, context);
    }
    throw error;
  }
}

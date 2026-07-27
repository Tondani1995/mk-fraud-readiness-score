import fs from 'node:fs/promises';
import ts from 'typescript';

const ALIAS_PREFIX = '@/';
const ALIAS_TARGET = new URL('../../src/', import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (/^next\/(server|headers|navigation|cache)$/.test(specifier)) {
    return nextResolve(`${specifier}.js`, context);
  }

  let effectiveSpecifier = specifier;
  if (specifier.startsWith(ALIAS_PREFIX)) {
    effectiveSpecifier = new URL(specifier.slice(ALIAS_PREFIX.length), ALIAS_TARGET).href;
  }

  try {
    return await nextResolve(effectiveSpecifier, context);
  } catch (error) {
    const isLocal = effectiveSpecifier.startsWith('./')
      || effectiveSpecifier.startsWith('../')
      || effectiveSpecifier.startsWith('file://');
    const hasExtension = /\.[a-zA-Z0-9]+$/.test(effectiveSpecifier);
    if (isLocal && !hasExtension && error?.code === 'ERR_MODULE_NOT_FOUND') {
      return nextResolve(`${effectiveSpecifier}.ts`, context);
    }
    if (isLocal && error?.code === 'ERR_UNSUPPORTED_DIR_IMPORT') {
      return nextResolve(`${effectiveSpecifier}/index.ts`, context);
    }
    throw error;
  }
}

export async function load(url, context, nextLoad) {
  if (!url.endsWith('.ts') && !url.endsWith('.tsx')) {
    return nextLoad(url, context);
  }

  const source = await fs.readFile(new URL(url), 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: new URL(url).pathname,
  });
  return {
    format: 'module',
    source: transpiled.outputText,
    shortCircuit: true,
  };
}

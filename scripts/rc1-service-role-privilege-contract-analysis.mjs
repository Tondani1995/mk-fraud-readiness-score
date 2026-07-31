import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const manifestPath = path.join(root, 'scripts', 'rc1-service-role-privilege-contract.manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const sourceRoot = path.join(root, 'src');
const sourceFiles = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (/\.tsx?$/.test(entry.name)) sourceFiles.push(absolute);
  }
}
walk(sourceRoot);

function relative(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function enclosingFunction(node, sourceFile) {
  let cursor = node;
  while (cursor) {
    if (
      ts.isFunctionDeclaration(cursor)
      || ts.isFunctionExpression(cursor)
      || ts.isArrowFunction(cursor)
      || ts.isMethodDeclaration(cursor)
    ) {
      if (cursor.name) return cursor.name.getText(sourceFile);
      if (ts.isVariableDeclaration(cursor.parent)) return cursor.parent.name.getText(sourceFile);
      if (ts.isPropertyAssignment(cursor.parent)) return cursor.parent.name.getText(sourceFile);
      return '<anonymous>';
    }
    cursor = cursor.parent;
  }
  return '<module>';
}

function argumentTarget(node, sourceFile) {
  const argument = node.arguments[0];
  if (!argument) return '<missing>';
  if (ts.isStringLiteralLike(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
    return argument.text;
  }
  return `<dynamic:${argument.getText(sourceFile).replace(/\s+/g, ' ')}>`;
}

function chainedMethods(node) {
  const methods = [];
  let cursor = node.parent;
  while (ts.isPropertyAccessExpression(cursor) || ts.isCallExpression(cursor)) {
    if (ts.isPropertyAccessExpression(cursor)) methods.push(cursor.name.text);
    cursor = cursor.parent;
  }
  return [...new Set(methods)];
}

const inventory = [];
for (const absolute of sourceFiles) {
  const file = relative(absolute);
  const source = fs.readFileSync(absolute, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  if (
    /^\s*['"]use client['"]/m.test(source)
    && /createSupabaseServiceClient|SUPABASE_SERVICE_ROLE_KEY/.test(source)
  ) {
    throw new Error(`service-role client or key crossed a browser boundary: ${file}`);
  }

  function visit(node) {
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ['from', 'rpc'].includes(node.expression.name.text)
    ) {
      const kind = node.expression.name.text;
      const receiver = node.expression.expression.getText(sourceFile).replace(/\s+/g, ' ');
      if (kind === 'from' && ['Array', 'Buffer'].includes(receiver)) {
        ts.forEachChild(node, visit);
        return;
      }
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const storage = kind === 'from' && /\.?storage$/.test(receiver);
      inventory.push({
        file,
        line: position.line + 1,
        function: enclosingFunction(node, sourceFile),
        kind: storage ? 'storage' : kind,
        target: argumentTarget(node, sourceFile),
        receiver,
        methods: chainedMethods(node).sort(),
        importsServiceFactory:
          source.includes('createSupabaseServiceClient')
          || source.includes('SUPABASE_SERVICE_ROLE_KEY'),
      });
    }
    if (
      ts.isPropertyAccessExpression(node)
      && node.name.text === 'admin'
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'auth'
    ) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      inventory.push({
        file,
        line: position.line + 1,
        function: enclosingFunction(node, sourceFile),
        kind: 'auth.admin',
        target: node.parent.getText(sourceFile).replace(/\s+/g, ' '),
        receiver: node.expression.expression.getText(sourceFile),
        methods: [],
        importsServiceFactory:
          source.includes('createSupabaseServiceClient')
          || source.includes('SUPABASE_SERVICE_ROLE_KEY'),
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

inventory.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
const stableInventory = inventory.map(({ line: _line, importsServiceFactory: _imports, ...item }) => item);
const fullAstInventorySha256 = crypto
  .createHash('sha256')
  .update(JSON.stringify(stableInventory))
  .digest('hex');

if (process.argv.includes('--print-hash')) {
  console.log(fullAstInventorySha256);
  process.exit(0);
}

assert.equal(
  fullAstInventorySha256,
  manifest.analysis.fullAstInventorySha256,
  'AST database-operation inventory changed: MANUAL PRIVILEGE REVIEW REQUIRED',
);

const tableByName = new Map(manifest.tables.map((table) => [table.table, table]));
const serviceRpcByName = new Map(
  manifest.serviceRoleRpcs.map((rpc) => [
    rpc.signature.match(/^public\.([^(]+)/)?.[1],
    rpc,
  ]),
);
const classifiedNonServiceRpcNames = new Set(
  Object.values(manifest.nonServiceRpcClassifications).flat(),
);
const serviceAdapterFiles = new Set(manifest.analysis.serviceRoleAdapterFiles);
const nonServiceCallSites = new Set(manifest.analysis.nonServiceCallSites);
const serviceTableOperations = new Map();
const serviceRpcNames = new Set();
const storageRefs = new Set();
const authAdminRefs = new Set();

function addTableOperation(table, operation, item) {
  if (!serviceTableOperations.has(table)) serviceTableOperations.set(table, new Set());
  serviceTableOperations.get(table).add(operation);
  assert(
    tableByName.has(table),
    `active service-role table ${table} is not in the manifest (${item.file}:${item.line})`,
  );
}

for (const item of inventory) {
  const callSite = `${item.file}:${item.line}:${item.kind === 'storage' ? 'from' : item.kind}`;
  const serviceCandidate =
    (item.importsServiceFactory || serviceAdapterFiles.has(item.file))
    && !nonServiceCallSites.has(callSite);

  if (item.kind === 'storage') {
    storageRefs.add(`${item.file}:${item.line}`);
    continue;
  }
  if (item.kind === 'auth.admin') {
    authAdminRefs.add(`${item.file}:${item.line}`);
    continue;
  }
  if (item.kind === 'from') {
    assert(
      !item.target.startsWith('<dynamic:'),
      `dynamic table access is unresolved: ${item.file}:${item.line} ${item.target}`,
    );
    if (!serviceCandidate) continue;
    const operations = new Set();
    for (const method of item.methods) {
      if (method === 'select') operations.add('S');
      if (method === 'insert') operations.add('I');
      if (method === 'update') operations.add('U');
      if (method === 'delete') operations.add('D');
      if (method === 'upsert') {
        operations.add('I');
        operations.add('U');
      }
    }
    assert(operations.size > 0, `unresolved service table verb: ${item.file}:${item.line}`);
    for (const operation of operations) addTableOperation(item.target, operation, item);
    continue;
  }
  if (item.kind === 'rpc') {
    if (serviceCandidate) {
      if (item.target === '<dynamic:rpcName>') {
        for (const name of ['execute_phase14_worker_step', 'terminal_phase14_generation_publication']) {
          serviceRpcNames.add(name);
        }
      } else {
        assert(
          !item.target.startsWith('<dynamic:'),
          `dynamic service-role RPC is unresolved: ${item.file}:${item.line} ${item.target}`,
        );
        serviceRpcNames.add(item.target);
      }
    } else if (!item.target.startsWith('<dynamic:')) {
      assert(
        classifiedNonServiceRpcNames.has(item.target) || serviceRpcByName.has(item.target),
        `RPC classification missing for ${item.target} at ${item.file}:${item.line}`,
      );
    } else {
      const allowedDynamic =
        `${item.file}:${item.line}` === 'src/lib/rc1/control-plane.ts:97'
        || `${item.file}:${item.line}` === 'src/lib/reports/premium-report-service-core.ts:74';
      assert(
        allowedDynamic,
        `dynamic non-service RPC is unresolved: ${item.file}:${item.line} ${item.target}`,
      );
    }
  }
}

for (const [name, table] of tableByName) {
  const actual = [...(serviceTableOperations.get(name) ?? [])].sort().join('');
  const expected = [...table.required].sort().join('');
  assert.equal(actual, expected, `service-role table contract drift for public.${name}`);
}
assert.equal(
  serviceTableOperations.size,
  tableByName.size,
  'manifest contains a table with no active direct service-role operation',
);

for (const name of serviceRpcNames) {
  assert(serviceRpcByName.has(name), `service-role RPC ${name} is not in the manifest`);
}
for (const name of serviceRpcByName.keys()) {
  assert(serviceRpcNames.has(name), `manifest service-role RPC ${name} has no active caller`);
}

assert.deepEqual(
  [...storageRefs].sort(),
  [...manifest.storageApiOnly].sort(),
  'Storage API call inventory changed: MANUAL PRIVILEGE REVIEW REQUIRED',
);
assert.deepEqual(
  [...authAdminRefs].sort(),
  [...manifest.authAdminApiOnly].sort(),
  'Auth Admin API call inventory changed: MANUAL PRIVILEGE REVIEW REQUIRED',
);

console.log(JSON.stringify({
  astCallSites: inventory.length,
  directServiceRoleTables: serviceTableOperations.size,
  serviceRoleRpcs: serviceRpcNames.size,
  storageApiCallSites: storageRefs.size,
  authAdminApiCallSites: authAdminRefs.size,
  fullAstInventorySha256,
}, null, 2));

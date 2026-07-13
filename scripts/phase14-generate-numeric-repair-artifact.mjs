import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';

const migrations = [
  ['0001', '0001_phase2_v1_1_schema_rls.sql'],
  ['0002', '0002_phase4_dev_seed.sql'],
  ['0003', '0003_phase5_methodology_seed.sql'],
  ['0004', '0004_phase4_v1_2_rate_limiting.sql'],
  ['0005', '0005_phase5_v1_1_guards.sql'],
  ['0006', '0006_phase6_scoring_guards.sql'],
  ['0007', '0007_phase6_v1_1_atomic_scoring.sql'],
  ['0009', '0009_methodology_copy_polish.sql']
];

const outputArgIndex = process.argv.indexOf('--out');
const outputPath = outputArgIndex >= 0 && process.argv[outputArgIndex + 1]
  ? process.argv[outputArgIndex + 1]
  : 'tmp/numeric-migration-repair-full-statement-artifact.sql';

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function dollarQuote(value, tag) {
  let safeTag = tag;
  while (value.includes(`$${safeTag}$`)) {
    safeTag = `${safeTag}_x`;
  }
  return `$${safeTag}$${value}$${safeTag}$`;
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let state = 'normal';
  let dollarTag = '';

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1] ?? '';

    if (state === 'normal') {
      if (char === '-' && next === '-') {
        state = 'line_comment';
        current += char;
        continue;
      }
      if (char === '/' && next === '*') {
        state = 'block_comment';
        current += char;
        continue;
      }
      if (char === "'") {
        state = 'single_quote';
        current += char;
        continue;
      }
      if (char === '"') {
        state = 'double_quote';
        current += char;
        continue;
      }
      if (char === '$') {
        const match = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
        if (match) {
          dollarTag = match[0];
          state = 'dollar_quote';
          current += match[0];
          i += match[0].length - 1;
          continue;
        }
      }
      if (char === ';') {
        const trimmed = current.trim();
        if (trimmed.length > 0) {
          statements.push(trimmed);
        }
        current = '';
        continue;
      }
      current += char;
      continue;
    }

    if (state === 'line_comment') {
      current += char;
      if (char === '\n') state = 'normal';
      continue;
    }

    if (state === 'block_comment') {
      current += char;
      if (char === '*' && next === '/') {
        current += next;
        i += 1;
        state = 'normal';
      }
      continue;
    }

    if (state === 'single_quote') {
      current += char;
      if (char === "'" && next === "'") {
        current += next;
        i += 1;
        continue;
      }
      if (char === "'") state = 'normal';
      continue;
    }

    if (state === 'double_quote') {
      current += char;
      if (char === '"' && next === '"') {
        current += next;
        i += 1;
        continue;
      }
      if (char === '"') state = 'normal';
      continue;
    }

    if (state === 'dollar_quote') {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length - 1;
        state = 'normal';
        dollarTag = '';
        continue;
      }
      current += char;
      continue;
    }
  }

  const trailing = current.trim();
  if (trailing.length > 0) {
    statements.push(trailing);
  }

  return statements.filter((statement) => statement.replace(/--.*$/gm, '').trim().length > 0);
}

const rows = [];
const summaryRows = [];

for (const [version, filename] of migrations) {
  const path = join('supabase', 'migrations', filename);
  const rawSql = await readFile(path, 'utf8');
  const statements = splitSqlStatements(rawSql);
  if (statements.length === 0) {
    throw new Error(`No executable statements parsed from ${path}`);
  }
  const name = filename.replace(/\.sql$/, '');
  const statementArray = statements
    .map((statement, index) => dollarQuote(statement, `mkfrs_${version}_${String(index + 1).padStart(3, '0')}`))
    .join(',\n        ');
  rows.push(`    (${quoteLiteral(version)}, ${quoteLiteral(name)}, array[\n        ${statementArray}\n      ]::text[])`);
  summaryRows.push(`${version}\t${name}\t${statements.length}`);
}

const sql = `-- MK Fraud Readiness Score V1\n-- Numeric foundational migration repair artefact\n--\n-- STATUS: CONTROLLER REVIEW ONLY. DO NOT EXECUTE UNLESS EXPLICITLY APPROVED.\n-- Preferred production operation remains:\n--   supabase migration repair 0001 0002 0003 0004 0005 0006 0007 0009 --status applied\n--\n-- This artefact is generated from the real repository migration SQL files and\n-- contains parsed executable statements, not marker comments. It is intended for\n-- emergency equivalence review only if Supabase CLI repair is unavailable.\n\nbegin;\n\nlock table supabase_migrations.schema_migrations in exclusive mode;\n\ndo $$\nbegin\n  if exists (\n    select 1\n    from supabase_migrations.schema_migrations\n    where version in ('0001','0002','0003','0004','0005','0006','0007','0009')\n  ) then\n    raise exception 'Refusing repair: one or more numeric foundational migration versions already exist.';\n  end if;\n\n  if exists (\n    select 1\n    from supabase_migrations.schema_migrations\n    where name in (\n      '0001_phase2_v1_1_schema_rls',\n      '0002_phase4_dev_seed',\n      '0003_phase5_methodology_seed',\n      '0004_phase4_v1_2_rate_limiting',\n      '0005_phase5_v1_1_guards',\n      '0006_phase6_scoring_guards',\n      '0007_phase6_v1_1_atomic_scoring',\n      '0009_methodology_copy_polish'\n    )\n  ) then\n    raise exception 'Refusing repair: one or more numeric foundational migration names already exist.';\n  end if;\nend $$;\n\ninsert into supabase_migrations.schema_migrations (version, name, statements)\nselect version, name, statements\nfrom (\n  values\n${rows.join(',\n')}\n) as repaired(version, name, statements);\n\nselect version, name, cardinality(statements) as statement_count\nfrom supabase_migrations.schema_migrations\nwhere version in ('0001','0002','0003','0004','0005','0006','0007','0009')\norder by version;\n\ncommit;\n\n-- Metadata-only rollback preparation, preferred CLI form:\n--   supabase migration repair 0001 0002 0003 0004 0005 0006 0007 0009 --status reverted\n--\n-- Emergency SQL rollback equivalence, controller approval required:\n--   begin;\n--   delete from supabase_migrations.schema_migrations\n--   where version in ('0001','0002','0003','0004','0005','0006','0007','0009');\n--   commit;\n`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, sql);
await writeFile(join(dirname(outputPath), 'numeric-repair-statement-summary.tsv'), `version\tname\tstatement_count\n${summaryRows.join('\n')}\n`);

console.log(`Generated ${outputPath}`);
console.log(summaryRows.join('\n'));

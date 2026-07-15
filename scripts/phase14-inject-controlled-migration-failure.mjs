import fs from 'node:fs';

const migrationPath = process.argv[2];
if (!migrationPath) throw new Error('Migration path is required.');

const marker = '\ncommit;';
const source = fs.readFileSync(migrationPath, 'utf8');
const markerIndex = source.indexOf(marker);
if (markerIndex < 0 || source.indexOf(marker, markerIndex + marker.length) >= 0) {
  throw new Error('Expected exactly one migration commit marker.');
}
const commitIndex = source.lastIndexOf(marker);
if (commitIndex !== markerIndex || source.slice(0, markerIndex).includes('\ncommit;')) {
  throw new Error('Migration is not atomic before its final commit marker.');
}

const controlledFailure = `do $phase14_controlled_boundary_failure$
begin
  raise exception 'controlled_phase14_post_boundary_failure';
end;
$phase14_controlled_boundary_failure$;

`;
fs.writeFileSync(
  migrationPath,
  `${source.slice(0, markerIndex)}${controlledFailure}${source.slice(markerIndex)}`
);

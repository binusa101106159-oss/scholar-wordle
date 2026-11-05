// Expand the existing tests/*.cjs suite consistently on Windows and Unix.
const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const root = join(__dirname, '..');
const files = readdirSync(join(root, 'tests')).filter(name => name.endsWith('.cjs')).sort();
const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files.map(name => join(root, 'tests', name))], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

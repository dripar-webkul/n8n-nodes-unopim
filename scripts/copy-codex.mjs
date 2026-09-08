import { cpSync, globSync } from 'node:fs';
import { dirname, join } from 'node:path';

for (const source of globSync('nodes/**/*.node.json')) {
	const target = join('dist', source);

	cpSync(source, target, { force: true });

	console.log(`codex → ${target} (from ${dirname(source)})`);
}

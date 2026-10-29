// Resolve the demo guests' favourites with the live Qloo API and save the IDs,
// so the hosted demo never pauses for ambiguous names.
// Usage: npm run demo:prepare   (Windows: npm.cmd run demo:prepare)
import { mkdir, writeFile } from 'node:fs/promises';
import { resolveDemoFavourites } from '../demo.js';
import { runQloo } from '../qloo-workflows.js';

const resolved = await resolveDemoFavourites(runQloo);
for (const [name, match] of Object.entries(resolved)) {
  console.log(match ? `✓ ${name} → ${match.name} (${match.type})${match.picked ? ' [first of several matches]' : ''}` : `✗ ${name} → not found in Qloo (left out of the demo)`);
}
const found = Object.values(resolved).filter(Boolean).length;
if (!found) { console.log('\nNothing resolved; check the Qloo credential and connection.'); process.exit(1); }
await mkdir(new URL('../demo/', import.meta.url), { recursive: true });
await writeFile(new URL('../demo/demo-resolved.json', import.meta.url), `${JSON.stringify(resolved, null, 2)}\n`);
console.log(`\nSaved ${found} of ${Object.keys(resolved).length} favourites to demo/demo-resolved.json. Commit this file.`);

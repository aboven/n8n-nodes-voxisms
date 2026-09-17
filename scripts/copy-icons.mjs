// n8n resolves icons and codex files relative to the compiled .node.js, so mirror them into dist/.
import { readdirSync, mkdirSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';

for (const entry of readdirSync('nodes', { recursive: true, withFileTypes: true })) {
  if (entry.isFile() && (entry.name.endsWith('.svg') || entry.name.endsWith('.node.json'))) {
    const src = join(entry.parentPath ?? entry.path, entry.name);
    const dest = join('dist', src);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
}

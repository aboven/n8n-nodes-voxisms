// Copies node icons (SVGs) into dist/ after tsc, preserving their relative paths.
// n8n resolves a node's `icon: 'file:voxisms.svg'` relative to the compiled .js file,
// so the SVGs must live next to the compiled nodes in dist/.
import { readdirSync, mkdirSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';

for (const entry of readdirSync('nodes', { recursive: true, withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.svg')) {
    const src = join(entry.parentPath ?? entry.path, entry.name);
    const dest = join('dist', src);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
}

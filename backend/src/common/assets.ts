import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** backend/assets, found from both src/ (tests) and dist/ (build). */
export function assetsDir(): string {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'assets');
    if (existsSync(join(candidate, 'fonts', 'Inter-Regular.ttf')))
      return candidate;
    dir = dirname(dir);
  }
  throw new Error('backend/assets not found');
}

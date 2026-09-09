import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { findRouteCoverageGaps, listHandlerFiles } from './route-coverage.js';

const SOURCE = `import handlerA from './v1/a.js';
import handlerB from './v1/admin/b/[id].js';
import handlerUnused from './v1/unused.js';

if (x) {
  handler = handlerA;
} else if (y) {
  handler = handlerB;
}
`;

describe('findRouteCoverageGaps (fixture source)', () => {
  it('flags missing imports and imported-but-unused bindings', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'routes-'));
    fs.writeFileSync(path.join(dir, 'a.ts'), 'x');
    fs.mkdirSync(path.join(dir, 'admin', 'b'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'admin', 'b', '[id].ts'), 'x');
    fs.writeFileSync(path.join(dir, 'orphan.ts'), 'x');
    fs.writeFileSync(path.join(dir, 'unused.ts'), 'x');
    expect(findRouteCoverageGaps(dir, SOURCE)).toEqual([
      { file: 'v1/orphan.ts', reason: 'not-imported' },
      { file: 'v1/unused.ts', reason: 'imported-but-unused' },
    ]);
  });
});

describe('listHandlerFiles', () => {
  it('skips specs and underscore-prefixed shared modules', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'routes-'));
    fs.writeFileSync(path.join(dir, 'a.ts'), 'x');
    fs.writeFileSync(path.join(dir, 'a.spec.ts'), 'x');
    fs.writeFileSync(path.join(dir, '_shared.ts'), 'x');
    fs.mkdirSync(path.join(dir, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'nested', '[id].ts'), 'x');
    expect(listHandlerFiles(dir)).toEqual(['a.ts', 'nested/[id].ts']);
  });
});

describe('live api/v1 tree vs dev-server route table (regression guard)', () => {
  it('every handler file is imported and routed', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const apiDir = path.resolve(here, '..');
    const gaps = findRouteCoverageGaps(
      path.join(apiDir, 'v1'),
      fs.readFileSync(path.join(apiDir, 'dev-server.ts'), 'utf8'),
    );
    expect(gaps).toEqual([]);
  });
});

import { cp, mkdir, readdir, readFile, rm } from 'node:fs/promises';

const distAssets = new URL('../apps/web/dist/assets/', import.meta.url);
const assetEntries = (await readdir(distAssets)).filter(name => name.endsWith('.js'));
const graph = new Map();

for (const file of assetEntries) {
  const code = await readFile(new URL(file, distAssets), 'utf8');
  const staticDeps = Array.from(code.matchAll(/from\s*["']\.\/([^"']+\.js)["']/g), m => m[1]);
  graph.set(file, staticDeps);
}

const state = new Map();
const stack = [];
function detectCycle(node) {
  state.set(node, 1);
  stack.push(node);
  for (const next of graph.get(node) ?? []) {
    if (state.get(next) === 1) {
      const cyclePath = [...stack.slice(stack.indexOf(next)), next].join(' -> ');
      throw new Error(`Circular static ESM chunk import detected in production bundle: ${cyclePath}`);
    }
    if (!state.get(next)) {
      detectCycle(next);
    }
  }
  stack.pop();
  state.set(node, 2);
}

for (const file of assetEntries) {
  if (!state.get(file)) {
    detectCycle(file);
  }
}

const target = new URL('../internal/webui/assets/', import.meta.url);
await mkdir(target, { recursive: true });
for (const entry of await readdir(target)) {
  if (entry !== '.gitkeep') {
    await rm(new URL(entry, target), { recursive: true, force: true });
  }
}
await cp(new URL('../apps/web/dist/', import.meta.url), target, { recursive: true });

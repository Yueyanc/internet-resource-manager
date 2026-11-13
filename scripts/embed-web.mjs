import { cp, mkdir, readdir, rm } from 'node:fs/promises';

const target = new URL('../internal/webui/assets/', import.meta.url);
await mkdir(target, { recursive: true });
for (const entry of await readdir(target)) {
  if (entry !== '.gitkeep') {
    await rm(new URL(entry, target), { recursive: true, force: true });
  }
}
await cp(new URL('../apps/web/dist/', import.meta.url), target, { recursive: true });

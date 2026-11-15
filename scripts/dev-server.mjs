import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, watch } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const buildDir = mkdtempSync(join(tmpdir(), 'irm-dev-server-'));
const binPath = join(buildDir, process.platform === 'win32' ? 'server.exe' : 'server');

let child = null;
let shuttingDown = false;
let building = false;
let reloadQueued = false;
let debounceTimer = null;
const watchers = [];

function buildBinary() {
  return new Promise((resolve) => {
    const proc = spawn('go', ['build', '-o', binPath, './apps/server'], {
      cwd: rootDir,
      env: process.env,
      stdio: 'inherit',
    });
    proc.on('close', code => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

function stopServer() {
  if (!child) {
    return Promise.resolve();
  }
  const current = child;
  child = null;
  return new Promise((resolve) => {
    const forceTimer = setTimeout(() => {
      current.kill('SIGKILL');
    }, 5000);
    current.once('close', () => {
      clearTimeout(forceTimer);
      resolve();
    });
    current.kill('SIGTERM');
  });
}

function startServer() {
  const proc = spawn(binPath, [], {
    cwd: rootDir,
    env: process.env,
    stdio: 'inherit',
  });
  child = proc;
  proc.on('close', (code) => {
    if (child === proc) {
      child = null;
      if (!shuttingDown && code && code !== 0) {
        process.stderr.write(`[dev-server] exited with code ${code}; waiting for Go/SQL changes...\n`);
      }
    }
  });
}

async function rebuildAndRestart(initial = false) {
  if (shuttingDown) {
    return;
  }
  if (building) {
    reloadQueued = true;
    return;
  }
  building = true;
  try {
    const ok = await buildBinary();
    if (!ok) {
      if (initial) {
        cleanup();
        process.exit(1);
      }
      process.stderr.write('[dev-server] build failed; keeping current server running.\n');
      return;
    }
    if (shuttingDown) {
      return;
    }
    await stopServer();
    if (!shuttingDown) {
      startServer();
    }
  }
  finally {
    building = false;
    if (reloadQueued && !shuttingDown) {
      reloadQueued = false;
      void rebuildAndRestart(false);
    }
  }
}

function isRelevantFile(filename) {
  if (!filename) {
    return false;
  }
  const normalized = filename.replaceAll('\\', '/');
  if (normalized.split('/').some(part => part.startsWith('.'))) {
    return false;
  }
  if (normalized.endsWith('_test.go')) {
    return false;
  }
  return normalized.endsWith('.go') || normalized.endsWith('.sql') || normalized === 'go.mod' || normalized === 'go.sum';
}

function scheduleReload(filename) {
  if (!isRelevantFile(filename) || shuttingDown) {
    return;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    process.stdout.write(`[dev-server] change detected (${filename}), rebuilding...\n`);
    void rebuildAndRestart(false);
  }, 250);
}

function cleanup() {
  for (const watcher of watchers.splice(0)) {
    watcher.close();
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  rmSync(buildDir, { recursive: true, force: true });
}

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  await stopServer();
  cleanup();
  process.exit(signal === 'SIGINT' ? 130 : 0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

if (!process.env.CI && process.env.IRM_DEV_WATCH !== '0') {
  for (const rel of ['apps/server', 'internal', 'db/migrations']) {
    const dir = join(rootDir, rel);
    if (existsSync(dir)) {
      watchers.push(watch(dir, { recursive: true }, (_event, filename) => {
        if (typeof filename === 'string') {
          scheduleReload(`${rel}/${filename}`);
        }
      }));
    }
  }

  for (const file of ['go.mod', 'go.sum']) {
    const fullPath = join(rootDir, file);
    if (existsSync(fullPath)) {
      watchers.push(watch(fullPath, () => scheduleReload(file)));
    }
  }
}

await rebuildAndRestart(true);

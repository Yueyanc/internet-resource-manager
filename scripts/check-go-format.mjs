import { execFileSync } from 'node:child_process';

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*.go'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
if (files.length) {
  const unformatted = execFileSync('gofmt', ['-l', ...files], { encoding: 'utf8' }).trim();
  if (unformatted) {
    process.stderr.write(`Run gofmt on:\n${unformatted}\n`);
    process.exitCode = 1;
  }
}

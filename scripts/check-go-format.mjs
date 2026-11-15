import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '*.go'], { encoding: 'utf8' }).split('\0').filter(path => path && existsSync(path));
if (files.length) {
  const unformatted = execFileSync('gofmt', ['-l', ...files], { encoding: 'utf8' }).trim();
  if (unformatted) {
    process.stderr.write(`Run gofmt on:\n${unformatted}\n`);
    process.exitCode = 1;
  }
}

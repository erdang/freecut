import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';

function hasFlag(flag) {
  return process.argv.slice(2).includes(flag);
}

function getNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function runCommand(command, args, label) {
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', toWindowsCommand(command, args)], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    : spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

  pipeWithPrefix(child.stdout, process.stdout, `[${label}] `);
  pipeWithPrefix(child.stderr, process.stderr, `[${label}] `);

  return child;
}

function toWindowsCommand(command, args) {
  return [command, ...args].map(quoteWindowsArg).join(' ');
}

function quoteWindowsArg(value) {
  if (value.length === 0) {
    return '""';
  }

  if (!/[\s"]/u.test(value)) {
    return value;
  }

  return `"${value
    .replace(/(\\*)"/g, '$1$1\\"')
    .replace(/(\\+)$/g, '$1$1')}"`;
}

function pipeWithPrefix(stream, output, prefix) {
  let pending = '';

  stream.on('data', (chunk) => {
    pending += chunk.toString();

    while (true) {
      const newlineIndex = pending.indexOf('\n');
      if (newlineIndex < 0) break;

      const line = pending.slice(0, newlineIndex + 1);
      pending = pending.slice(newlineIndex + 1);
      output.write(prefix + line);
    }
  });

  stream.on('end', () => {
    if (pending.length > 0) {
      output.write(prefix + pending + '\n');
      pending = '';
    }
  });
}

function terminateChild(child) {
  if (!child.pid) return;

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
    });
    return;
  }

  child.kill('SIGTERM');
}

function printHelp() {
  console.log('Usage: npm run dev:compare -- [--skip-build] [--full-dev]');
  console.log('');
  console.log('Starts both the local dev server and the local perf preview server.');
  console.log('');
  console.log('  --skip-build  Reuse the existing perf build instead of rebuilding first');
  console.log('  --full-dev    Use `npm run dev` instead of `npm run dev:quiet`');
}

if (hasFlag('--help') || hasFlag('-h')) {
  printHelp();
  process.exit(0);
}

const npmCommand = getNpmCommand();
const devScript = hasFlag('--full-dev') ? 'dev' : 'dev:quiet';
const skipBuild = hasFlag('--skip-build');

if (!skipBuild) {
  console.log('[compare] building perf bundle...');
  const buildResult = spawnSync(npmCommand, ['run', 'build:perf'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });

  if (buildResult.status !== 0) {
    process.exit(buildResult.status ?? 1);
  }
}

console.log('[compare] starting dev and perf side-by-side');
console.log(`[compare] dev:  http://localhost:5173 (${devScript})`);
console.log('[compare] perf: http://localhost:4173 (preview:perf)');
console.log('[compare] press Ctrl+C to stop both');

const children = [
  runCommand(npmCommand, ['run', devScript], 'dev'),
  runCommand(npmCommand, ['run', 'preview:perf'], 'perf'),
];

let shuttingDown = false;

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    terminateChild(child);
  }

  process.exit(exitCode);
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;

    if (code === 0 || signal === 'SIGTERM' || signal === 'SIGINT') {
      shutdown(0);
      return;
    }

    shutdown(code ?? 1);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

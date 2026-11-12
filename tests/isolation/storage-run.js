import readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import { createStorageHarness, CASES, StorageHarnessError, safeStorageDiagnostic } from './storage-harness.js';

export async function runStorageSession({ env, lines, fetchImpl = globalThis.fetch, write = console.log, ...options }) {
  let harness, commandErrors = 0, cleanupAttempted = false;
  const commandsCompleted = [];
  const emit = event => write(JSON.stringify(event)); // Harness output contains only fixed vocabulary/masked tracking.
  function report(error, phase) {
    commandErrors++;
    const fallback = phase === 'config' ? 'invalid_config' : phase === 'input' ? 'input_error' : 'unexpected_error';
    emit({ caseId: 'ERROR', ...safeStorageDiagnostic({ reason: fallback, operation: phase,
      ...(error instanceof StorageHarnessError ? error.diagnostic : {}), phase }) });
  }
  const clean = async () => {
    if (!harness) return;
    cleanupAttempted = true;
    try { await harness.cleanup(); } catch (error) { report(error, 'cleanup'); }
  };
  try {
    harness = createStorageHarness(env, { ...options, fetchImpl, emit });
    for await (const raw of lines) {
      const command = String(raw).trim().toLowerCase();
      if (command === 'quit') break;
      if (!['prepare', 'execute', 'cleanup'].includes(command)) {
        report(new StorageHarnessError({ reason: 'invalid_command', operation: 'command' }), 'command'); continue;
      }
      try {
        cleanupAttempted = command === 'cleanup';
        await harness[command](); commandsCompleted.push(command);
      } catch (error) {
        report(error, command);
        if (command !== 'cleanup') await clean(); // Never recursively retry a manual cleanup failure.
      }
    }
  } catch (error) { report(error, harness ? 'input' : 'config'); }
  finally { if (harness && !harness.state().cleanupCompleted && !cleanupAttempted) await clean(); }
  const state = harness?.state() || { prepared: false, executeCompleted: false, cleanupCompleted: false,
    pass: 0, fail: 0, inconclusive: 0, fixturesPending: [], uncertainPending: [] };
  const successful = state.prepared && state.executeCompleted && state.cleanupCompleted && state.pass === CASES.length &&
    !state.fail && !state.inconclusive && !commandErrors && !state.fixturesPending.length && !state.uncertainPending.length;
  const summary = { caseId: 'SUMMARY', ...state, commandsCompleted, commandErrors, successful };
  emit(summary);
  return { summary, exitCode: successful ? 0 : 1 };
}

async function main() {
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  terminal.on('SIGINT', () => terminal.close()); // EOF/interrupt follows the same finally cleanup path.
  console.log('03E1 Storage [prepare | execute | cleanup | quit]. Mantenga esta terminal abierta para cleanup.');
  try { const result = await runStorageSession({ env: process.env, lines: terminal }); process.exitCode = result.exitCode; }
  finally { terminal.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

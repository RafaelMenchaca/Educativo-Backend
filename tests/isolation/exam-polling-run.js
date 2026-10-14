// Explicit interactive entrypoint. Importing this module performs no I/O.
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { createExamPollingHarness, safeExamPollingEvent, safeExamPollingSummary } from './exam-polling-harness.js';

export async function runExamPollingSession({ env, lines, fetchImpl = globalThis.fetch, timeoutControlFactory, uuid, now, write = console.log }) {
  const emit = event => write(JSON.stringify(safeExamPollingEvent(event)));
  const commandsCompleted = [];
  let commandErrors = 0;
  let harness;
  try {
    harness = createExamPollingHarness(env, { fetchImpl, emit, ...(timeoutControlFactory ? { timeoutControlFactory } : {}), ...(uuid ? { uuid } : {}), ...(now ? { now } : {}) });
    for await (const line of lines) {
      const command = line.trim();
      if (command === 'quit') break;
      if (!['prepare', 'execute', 'cleanup'].includes(command)) { write('Comando no permitido.'); continue; }
      try {
        await harness[command]();
        commandsCompleted.push(command);
      } catch {
        commandErrors++;
        emit({ caseId: 'ERROR', result: 'INCONCLUSIVE' });
        harness.residuals();
      }
    }
  } catch {
    commandErrors++;
    emit({ caseId: 'ERROR', result: 'INCONCLUSIVE' });
  }
  const current = harness?.state() || { prepared: false, executeCompleted: false, cleanupCompleted: false, pass: 0, fail: 0, inconclusive: 0, fixturesPending: [], uncertainPending: [] };
  const successful = current.prepared && current.executeCompleted && current.cleanupCompleted
    && current.pass === 5 && current.fail === 0 && current.inconclusive === 0 && commandErrors === 0
    && current.fixturesPending.length === 0 && current.uncertainPending.length === 0;
  const summary = safeExamPollingSummary({ ...current, commandsCompleted, commandErrors, successful });
  write(JSON.stringify(summary));
  return { summary, exitCode: successful ? 0 : 1 };
}

async function main() {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  console.log('Educativo IA 03C polling: prepare crea 1 job failed; execute solo usa GET; cleanup elimina ese ID; quit emite SUMMARY.');
  try {
    const result = await runExamPollingSession({ env: process.env, lines: terminal });
    process.exitCode = result.exitCode;
  } finally { terminal.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

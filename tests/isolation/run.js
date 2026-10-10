// Explicit interactive entrypoint. No application imports, dotenv or SDK.
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { createHarness, safeEvent, safeSummary } from './harness.js';

export async function runSession({ env, lines, fetchImpl = globalThis.fetch, timeoutControlFactory, write = console.log }) {
  const emit = event => write(JSON.stringify(safeEvent(event)));
  const commandsCompleted = [];
  let commandErrors = 0;
  let harness;
  try {
    harness = createHarness(env, { fetchImpl, emit, ...(timeoutControlFactory ? { timeoutControlFactory } : {}) });
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
  const current = harness?.state() || { prepared: false, executeCompleted: false, pass: 0, fail: 0, inconclusive: 0, fixturesPending: [], uncertainPending: [] };
  const successful = current.fail === 0 && current.inconclusive === 0 && commandErrors === 0
    && current.fixturesPending.length === 0 && current.uncertainPending.length === 0
    && (!current.prepared || current.executeCompleted);
  const summary = safeSummary({ ...current, commandsCompleted, commandErrors, successful });
  write(JSON.stringify(summary));
  return { summary, exitCode: successful ? 0 : 1 };
}

async function main() {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  console.log('Educativo IA 03A: prepare crea 2 planteles; execute solo lee; cleanup elimina esos IDs; quit sale. No cerrar antes de cleanup.');
  try {
    const result = await runSession({ env: process.env, lines: terminal });
    process.exitCode = result.exitCode;
  } finally {
    terminal.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

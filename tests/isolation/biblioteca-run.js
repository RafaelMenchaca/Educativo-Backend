// Educativo IA 03D2A interactive runner. Importing performs no I/O.
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import { createBibliotecaHarness, safeBibliotecaEvent, safeBibliotecaSummary } from './biblioteca-harness.js';

export async function runBibliotecaSession({ env, lines, fetchImpl = globalThis.fetch, timeoutControlFactory, uuid, now, write = console.log }) {
  const emit = event => write(JSON.stringify(safeBibliotecaEvent(event)));
  let harness;
  let commandErrors = 0;
  const commandsCompleted = [];
  try { harness = createBibliotecaHarness(env, { fetchImpl, emit, ...(timeoutControlFactory ? { timeoutControlFactory } : {}), ...(uuid ? { uuid } : {}), ...(now ? { now } : {}) }); }
  catch { commandErrors++; }
  if (harness) {
    for await (const raw of lines) {
      const command = String(raw || '').trim().toLowerCase();
      if (command === 'quit') break;
      if (!['prepare', 'execute', 'cleanup'].includes(command)) continue;
      try { await harness[command](); commandsCompleted.push(command); }
      catch { commandErrors++; emit({ caseId: 'ERROR', phase: command, reason: 'invalid_state', result: 'INCONCLUSIVE' }); }
    }
    harness.residuals();
  }
  const state = harness?.state() || { pass: 0, fail: 0, inconclusive: 0, prepared: false, executeCompleted: false, cleanupCompleted: false, fixturesPending: [], uncertainPending: [] };
  const successful = commandErrors === 0 && state.pass > 0 && state.fail === 0 && state.inconclusive === 0 && state.prepared && state.executeCompleted && state.cleanupCompleted && state.fixturesPending.length === 0 && state.uncertainPending.length === 0;
  const summary = safeBibliotecaSummary({ ...state, commandsCompleted, commandErrors, successful });
  write(JSON.stringify(summary));
  return { exitCode: successful ? 0 : 1, summary };
}

async function main() {
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const result = await runBibliotecaSession({ env: process.env, lines: terminal });
  terminal.close();
  process.exitCode = result.exitCode;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();

import readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import { createDerivedResourcesHarness, safeDerivedEvent } from './derived-resources-harness.js';

export function derivedExitCode(state, commandErrors, commands) {
  return commands.includes('prepare') && state.executeCompleted && state.cleanupCompleted && !state.fail && !state.inconclusive && !commandErrors && !state.fixturesPending.length && !state.uncertainPending.length ? 0 : 1;
}

export async function runDerivedSession(env = process.env, { input = process.stdin, output = process.stdout } = {}) {
  const emit = event => output.write(`${JSON.stringify(safeDerivedEvent(event))}\n`);
  let harness;
  let commandErrors = 0;
  const commands = [];
  try { harness = createDerivedResourcesHarness(env, { emit }); }
  catch { return 1; }
  const rl = readline.createInterface({ input, output, terminal: true });
  for await (const raw of rl) {
    const command = raw.trim().toLowerCase();
    if (command === 'quit') break;
    if (!['prepare', 'execute', 'cleanup'].includes(command)) continue;
    try { await harness[command](); commands.push(command); }
    catch { commandErrors++; emit({ caseId: 'DIAGNOSTIC', phase: command, reason: 'invalid_state' }); }
  }
  const state = harness.state();
  const exitCode = derivedExitCode(state, commandErrors, commands);
  output.write(`${JSON.stringify({ ...state, caseId: 'SUMMARY', commandsCompleted: commands, commandErrors, successful: exitCode === 0 })}\n`);
  return exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await runDerivedSession();
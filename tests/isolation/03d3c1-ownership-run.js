import readline from 'node:readline/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createOwnershipHarness, ownershipExitCode } from './03d3c1-ownership-harness.js';
export async function main(env=process.env,{input=process.stdin,output=process.stdout}={}){const events=[],h=createOwnershipHarness(env,{emit:e=>{events.push(e);output.write(`${JSON.stringify(e)}\n`)}}),rl=readline.createInterface({input,output});try{for(;;){const cmd=(await rl.question('03D3C1 ownership [prepare|execute|cleanup|quit]> ')).trim();try{if(cmd==='prepare')await h.prepare();else if(cmd==='execute')await h.execute();else if(cmd==='cleanup')await h.cleanup();else if(cmd==='quit')break;else output.write('{"caseId":"DIAGNOSTIC","reason":"invalid_state"}\n')}catch(e){h.recordCommandError();output.write(`${JSON.stringify({caseId:'DIAGNOSTIC',...(e.diagnostic||{reason:'invalid_state'})})}\n`)}}}finally{rl.close()}const s=h.state();output.write(`${JSON.stringify({caseId:'SUMMARY',...s,runId:undefined})}\n`);return ownershipExitCode(s)}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)process.exitCode=await main();

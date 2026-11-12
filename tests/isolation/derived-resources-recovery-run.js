import readline from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { createDerivedRecovery, recoveryExitCode, safeRecoveryEvent } from './derived-resources-recovery.js';

export async function runRecoverySession(env=process.env,{input=process.stdin,output=process.stdout,emit=line=>output.write(`${JSON.stringify(safeRecoveryEvent(line))}\n`),factory=createDerivedRecovery}={}){
  const recovery=factory(env,{emit}),rl=readline.createInterface({input,output,terminal:true});let commandErrors=0;
  try {
    while(true){const command=(await rl.question('03D2B recovery [discover|recover|quit]> ')).trim().toLowerCase();if(command==='quit')break;try{if(command==='discover')await recovery.discover();else if(command==='recover')await recovery.recover();else commandErrors++;}catch{commandErrors++;}}
  }
  finally{rl.close();}
  const state={...recovery.state(),commandErrors:recovery.state().commandErrors+commandErrors};emit({caseId:'SUMMARY',...state});return recoveryExitCode({...state,successful:state.successful&&commandErrors===0});
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await runRecoverySession();

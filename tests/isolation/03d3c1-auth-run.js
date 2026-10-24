import readline from 'node:readline/promises';
import process from 'node:process';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {AuthConfigError,buildAuthVerifierConfig,createAuthVerifier,authVerifierExitCode,safeAuthEvent} from './03d3c1-auth-verifier.js';

const writeEvent=(output,event)=>output.write(`${JSON.stringify(safeAuthEvent(event))}\n`);
export async function main(env=process.env,{input=process.stdin,output=process.stdout}={}){
 let h;
 try{
  const config=buildAuthVerifierConfig(env);
  h=createAuthVerifier(config,{emit:event=>output.write(`${JSON.stringify(event)}\n`)});
 }catch(error){
  writeEvent(output,{caseId:'DIAGNOSTIC',phase:'config',result:'INCONCLUSIVE',reason:error instanceof AuthConfigError?error.code:'invalid_state'});
  writeEvent(output,{caseId:'SUMMARY',result:'INCONCLUSIVE'});
  return 1;
 }
 const rl=readline.createInterface({input,output});
 try{
  for(;;){
   const cmd=(await rl.question('03D3C1 Auth [verify-create|verify-delete|quit]> ')).trim();
   if(cmd==='verify-create'){
    try{await h.verifyCreate()}catch{writeEvent(output,{caseId:'DIAGNOSTIC',phase:'verify-create',result:'INCONCLUSIVE',reason:'invalid_state'})}
   }else if(cmd==='verify-delete'){
    const authUserCount=Number(await rl.question('auth_user_count (resultado agregado)> '));
    const profileCount=Number(await rl.question('profile_count (resultado agregado)> '));
    const orphanProfileCount=Number(await rl.question('orphan_profile_count (resultado agregado)> '));
    const orphanUserSettingsCount=Number(await rl.question('orphan_user_settings_count (resultado agregado)> '));
    h.verifyDelete({authUserCount,profileCount,orphanProfileCount,orphanUserSettingsCount});
   }else if(cmd==='quit')break;
   else writeEvent(output,{caseId:'DIAGNOSTIC',result:'INCONCLUSIVE',reason:'invalid_state'});
  }
 }finally{rl.close()}
 const state=h.state();output.write(`${JSON.stringify({caseId:'SUMMARY',...state})}\n`);return authVerifierExitCode(state)
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().then(code=>{process.exitCode=code}).catch(()=>{process.stdout.write('{"caseId":"DIAGNOSTIC","phase":"config","result":"INCONCLUSIVE","reason":"invalid_state"}\n');process.exitCode=1})
}

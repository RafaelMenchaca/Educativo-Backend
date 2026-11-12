$ErrorActionPreference='Stop'
if(-not(Get-Command node -ErrorAction SilentlyContinue)){throw 'Node.js no disponible.'}
function Read-Hidden([string]$Prompt){$s=Read-Host $Prompt -AsSecureString;$p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);try{[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}}
$names=@('APP_ENV','SUPABASE_URL','EDUCATIVO_AUTH_TEST','EDUCATIVO_AUTH_PROJECT','EDUCATIVO_PUBLIC_KEY','EDUCATIVO_AUTH_EMAIL','EDUCATIVO_AUTH_PASSWORD')
try{
 $project=Read-Host 'Escriba exactamente educativo-backend-test';if($project -ne 'educativo-backend-test'){throw 'Proyecto test no confirmado.'}
 $env:APP_ENV='test';$env:SUPABASE_URL='https://gwdtlbisykzzplgzczzq.supabase.co';$env:EDUCATIVO_AUTH_TEST='confirmed';$env:EDUCATIVO_AUTH_PROJECT=$project
 $env:EDUCATIVO_PUBLIC_KEY=Read-Hidden 'Clave publica test';$env:EDUCATIVO_AUTH_EMAIL=Read-Hidden 'Email sintetico .invalid';$env:EDUCATIVO_AUTH_PASSWORD=Read-Hidden 'Password temporal'
 & node (Join-Path $PSScriptRoot '03d3c1-auth-run.js');exit $LASTEXITCODE
}finally{foreach($n in $names){[Environment]::SetEnvironmentVariable($n,$null,'Process')}}

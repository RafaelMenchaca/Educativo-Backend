$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js no disponible.' }
function Read-Hidden([string]$Prompt) { $s=Read-Host $Prompt -AsSecureString; $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try {[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)} }
$names=@('APP_ENV','SUPABASE_URL','EDUCATIVO_PUBLIC_KEY','EDUCATIVO_A_ID','EDUCATIVO_A_TOKEN','EDUCATIVO_B_ID','EDUCATIVO_B_TOKEN','EDUCATIVO_SYNTHETIC_USERS','EDUCATIVO_OWNERSHIP_TEST')
try {
 if ((Read-Host 'Escriba exactamente educativo-backend-test') -ne 'educativo-backend-test') { throw 'Proyecto test no confirmado.' }
 if ((Read-Host 'Confirme A/B sinteticos, distintos y exclusivos escribiendo confirmed') -ne 'confirmed') { throw 'Cuentas no confirmadas.' }
 $env:APP_ENV='test';$env:SUPABASE_URL='https://gwdtlbisykzzplgzczzq.supabase.co';$env:EDUCATIVO_SYNTHETIC_USERS='confirmed';$env:EDUCATIVO_OWNERSHIP_TEST='confirmed'
 $env:EDUCATIVO_PUBLIC_KEY=Read-Hidden 'Clave publica test';$env:EDUCATIVO_A_ID=Read-Hidden 'UUID A';$env:EDUCATIVO_A_TOKEN=Read-Hidden 'Token A';$env:EDUCATIVO_B_ID=Read-Hidden 'UUID B';$env:EDUCATIVO_B_TOKEN=Read-Hidden 'Token B'
 & node (Join-Path $PSScriptRoot '03d3c1-ownership-run.js'); exit $LASTEXITCODE
} finally { foreach($n in $names){[Environment]::SetEnvironmentVariable($n,$null,'Process')} }

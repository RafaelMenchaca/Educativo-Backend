# Recuperacion manual 03D2B. Nunca dot-source. No lee .env ni acepta URLs o IDs de filas.
$ErrorActionPreference = 'Stop'
$exitCode = 1
$names = @('APP_ENV','SUPABASE_URL','EDUCATIVO_API_URL','EDUCATIVO_PUBLIC_KEY','EDUCATIVO_A_ID','EDUCATIVO_B_ID','EDUCATIVO_A_TOKEN','EDUCATIVO_B_TOKEN','EDUCATIVO_SYNTHETIC_USERS','EDUCATIVO_LOCAL_API_VERIFIED','EDUCATIVO_RECOVERY_RUN_ID')
function Set-Hidden([string]$name,[string]$label){$secure=Read-Host $label -AsSecureString;$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure);try{[Environment]::SetEnvironmentVariable($name,[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer),'Process')}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer);$secure.Dispose()}}
try {
  $env:APP_ENV='test'
  $env:SUPABASE_URL='https://gwdtlbisykzzplgzczzq.supabase.co'
  $env:EDUCATIVO_API_URL='http://127.0.0.1:3000'
  $env:EDUCATIVO_LOCAL_API_VERIFIED='confirmed'
  $env:EDUCATIVO_RECOVERY_RUN_ID=Read-Host 'Run ID sanitizado que se recuperara'
  $env:EDUCATIVO_SYNTHETIC_USERS=Read-Host 'A/B sinteticos, distintos y exclusivos: escriba confirmed'
  Set-Hidden 'EDUCATIVO_PUBLIC_KEY' 'Clave PUBLICA test (entrada oculta)'
  foreach($actor in @('A','B')){Set-Hidden "EDUCATIVO_${actor}_ID" "UUID sintetico $actor (entrada oculta)";Set-Hidden "EDUCATIVO_${actor}_TOKEN" "Token test vigente $actor (entrada oculta)"}
  Write-Host 'Use discover, revise el resumen sanitizado, luego recover. No se solicitan IDs de filas ni unidades.'
  & node (Join-Path $PSScriptRoot 'derived-resources-recovery-run.js')
  $exitCode=$LASTEXITCODE
} catch { Write-Host 'Recovery no completada; no comparta errores raw.'; $exitCode=1 }
finally { foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$null,'Process')} }
exit $exitCode

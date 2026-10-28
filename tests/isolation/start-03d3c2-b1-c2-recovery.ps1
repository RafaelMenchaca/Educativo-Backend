$ErrorActionPreference = 'Stop'
function Read-Hidden([string]$Prompt) { $s=Read-Host $Prompt -AsSecureString; $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try {[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)} }
if ((Read-Host 'Type educativo-backend-test to confirm the TEST project') -cne 'educativo-backend-test') { Write-Error 'invalid_project_confirmation' }
try {
  $env:EIA_B1C2_MODE='recovery'; $env:EIA_B1C2_APP_ENV='test'; $env:EIA_B1C2_PROJECT='educativo-backend-test'; $env:EIA_B1C2_URL='https://gwdtlbisykzzplgzczzq.supabase.co'
  $env:EIA_B1C2_RUN_ID=Read-Host 'Run ID'; $env:EIA_B1C2_ADMIN_KEY=Read-Hidden 'Administrative TEST credential'
  $env:EIA_B1C2_A_USER=Read-Hidden 'Synthetic user A UUID'; $env:EIA_B1C2_A_UNIT=Read-Hidden 'Synthetic unit A UUID'
  $env:EIA_B1C2_B_USER=Read-Hidden 'Synthetic user B UUID'; $env:EIA_B1C2_B_UNIT=Read-Hidden 'Synthetic unit B UUID'
  node "$PSScriptRoot/03d3c2-b1-c2-admin-cli.js"; exit $LASTEXITCODE
} finally { 'EIA_B1C2_MODE','EIA_B1C2_APP_ENV','EIA_B1C2_PROJECT','EIA_B1C2_URL','EIA_B1C2_RUN_ID','EIA_B1C2_ADMIN_KEY','EIA_B1C2_A_USER','EIA_B1C2_A_UNIT','EIA_B1C2_B_USER','EIA_B1C2_B_UNIT' | ForEach-Object { Remove-Item "Env:$_" -ErrorAction SilentlyContinue } }

$ErrorActionPreference = 'Stop'
function Read-Hidden([string]$Prompt) { $s=Read-Host $Prompt -AsSecureString; $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try {[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)} }
$mode=$env:EIA_B2_SEQUENCE_MODE
if ($mode -notin @('pre_migration','post_migration')) { Write-Error 'Set EIA_B2_SEQUENCE_MODE to pre_migration or post_migration before credentials.'; exit 1 }
Write-Host "B2 mode: $mode"
$confirm=Read-Host 'Type educativo-backend-test to confirm project'
if ($confirm -ne 'educativo-backend-test') { Write-Error 'Project confirmation failed.'; exit 1 }
try {
  $env:APP_ENV='test'; $env:EIA_B2_PROJECT_CONFIRMATION=$confirm
  $env:EIA_B2_RUN_ID=Read-Host 'Run ID to recover'
  $env:EIA_B2_PUBLIC_KEY=Read-Hidden 'Test public key'
  $env:EIA_B2_USER_ID=Read-Hidden 'Synthetic actor A UUID'
  $env:EIA_B2_ACCESS_TOKEN=Read-Hidden 'Synthetic actor A access token'
  node "$PSScriptRoot/03d3c2-b2-recovery-run.js"
  exit $LASTEXITCODE
} finally { 'EIA_B2_RUN_ID','EIA_B2_PUBLIC_KEY','EIA_B2_USER_ID','EIA_B2_ACCESS_TOKEN','EIA_B2_PROJECT_CONFIRMATION' | ForEach-Object { Remove-Item "Env:$_" -ErrorAction SilentlyContinue } }

# Run manually in a dedicated PowerShell terminal. Never dot-source this script.
# No .env/config.local.js reads. No credentials in command arguments or files.
$ErrorActionPreference = 'Stop'
$auditHarnessExitCode = 1
$auditNames = @('APP_ENV','SUPABASE_URL','EDUCATIVO_API_URL','EDUCATIVO_PUBLIC_KEY',
  'EDUCATIVO_A_ID','EDUCATIVO_B_ID','EDUCATIVO_A_TOKEN','EDUCATIVO_B_TOKEN',
  'EDUCATIVO_SYNTHETIC_USERS','EDUCATIVO_METADATA_REVIEWED','EDUCATIVO_LOCAL_API_VERIFIED')
function Set-AuditPrivateValue([string]$name, [string]$label) {
  $auditSecure = Read-Host $label -AsSecureString
  $auditPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($auditSecure)
  try {
    [Environment]::SetEnvironmentVariable($name, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($auditPointer), 'Process')
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($auditPointer)
    $auditSecure.Dispose()
  }
}
try {
  $env:APP_ENV = 'test'
  $env:SUPABASE_URL = 'https://gwdtlbisykzzplgzczzq.supabase.co'
  $env:EDUCATIVO_API_URL = 'http://127.0.0.1:3000'
  Write-Host 'Educativo IA 03A: lea docs/ISOLATION_03A_HARNESS.md. No continuar con metadatos o API sin verificar.'
  $env:EDUCATIVO_METADATA_REVIEWED = Read-Host 'Metadatos actuales y ausencia de efectos externos revisados: escriba confirmed'
  $env:EDUCATIVO_LOCAL_API_VERIFIED = Read-Host 'Backend local verificado contra test: escriba confirmed'
  $env:EDUCATIVO_SYNTHETIC_USERS = Read-Host 'A/B existentes, distintos, sinteticos y exclusivos para pruebas: escriba confirmed'
  Set-AuditPrivateValue 'EDUCATIVO_PUBLIC_KEY' 'Clave PUBLICA test suministrada por operador (entrada oculta)'
  foreach ($auditActor in @('A','B')) {
    Set-AuditPrivateValue "EDUCATIVO_${auditActor}_ID" "UUID sintetico $auditActor (entrada oculta)"
    Set-AuditPrivateValue "EDUCATIVO_${auditActor}_TOKEN" "Access token test vigente de $auditActor (entrada oculta)"
  }
  & node (Join-Path $PSScriptRoot 'run.js')
  $auditHarnessExitCode = $LASTEXITCODE
  if ($auditHarnessExitCode -ne 0) { Write-Host '03A: ejecucion inconclusa o fallida; revisar resumen, sin compartir credenciales.' }
} catch {
  $auditHarnessExitCode = 1
  Write-Host '03A: no se completo el arranque o la ejecucion. Revisar guia; no compartir el error del proveedor.'
} finally {
  foreach ($auditName in $auditNames) {
    [Environment]::SetEnvironmentVariable($auditName, $null, 'Process')
  }
}
exit $auditHarnessExitCode

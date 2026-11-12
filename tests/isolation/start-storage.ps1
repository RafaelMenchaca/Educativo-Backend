# Run manually in a dedicated PowerShell process; never dot-source. No credential files.
$ErrorActionPreference = 'Stop'
$storageExitCode = 1
$storageNames = @('APP_ENV','SUPABASE_URL','EDUCATIVO_STORAGE_TEST','EDUCATIVO_SYNTHETIC_USERS',
  'EDUCATIVO_PUBLIC_KEY','EDUCATIVO_A_ID','EDUCATIVO_A_TOKEN','EDUCATIVO_B_ID','EDUCATIVO_B_TOKEN')
function Set-StoragePrivate([string]$Name, [string]$Label) {
  $storageSecure = Read-Host $Label -AsSecureString
  $storagePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($storageSecure)
  try { [Environment]::SetEnvironmentVariable($Name, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($storagePointer), 'Process') }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($storagePointer); $storageSecure.Dispose() }
}
try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node requerido.' }
  if ((Read-Host 'Escriba exactamente educativo-backend-test') -cne 'educativo-backend-test') { throw 'Ambiente no confirmado.' }
  if ((Read-Host 'A/B sinteticos, distintos y exclusivos de test: escriba confirmed') -cne 'confirmed') { throw 'Usuarios no confirmados.' }
  $env:APP_ENV = 'test'
  $env:SUPABASE_URL = 'https://gwdtlbisykzzplgzczzq.supabase.co'
  $env:EDUCATIVO_STORAGE_TEST = 'educativo-backend-test'
  $env:EDUCATIVO_SYNTHETIC_USERS = 'confirmed'
  Set-StoragePrivate 'EDUCATIVO_PUBLIC_KEY' 'Clave PUBLICA test (oculta; nunca service role)'
  foreach ($storageActor in @('A','B')) {
    Set-StoragePrivate "EDUCATIVO_${storageActor}_ID" "UUID sintetico $storageActor (oculto)"
    Set-StoragePrivate "EDUCATIVO_${storageActor}_TOKEN" "Access token vigente $storageActor (oculto)"
  }
  Write-Host '03E1: solo Storage test. No necesita backend local. prepare -> execute -> cleanup -> quit.'
  & node (Join-Path $PSScriptRoot 'storage-run.js')
  $storageExitCode = $LASTEXITCODE
} catch {
  Write-Host '03E1 no completo el arranque. Revise la guia; no comparta credenciales ni errores del proveedor.'
  $storageExitCode = 1
} finally {
  foreach ($storageName in $storageNames) { [Environment]::SetEnvironmentVariable($storageName, $null, 'Process') }
}
exit $storageExitCode

# Run manually in a dedicated PowerShell terminal. Never dot-source this script.
# No .env/config.local.js reads. No credentials in command arguments or files.
$ErrorActionPreference = 'Stop'
$examPollingExitCode = 1
$examPollingNames = @('APP_ENV','SUPABASE_URL','EDUCATIVO_API_URL','EDUCATIVO_PUBLIC_KEY',
  'EDUCATIVO_A_ID','EDUCATIVO_B_ID','EDUCATIVO_A_TOKEN','EDUCATIVO_B_TOKEN',
  'EDUCATIVO_SYNTHETIC_USERS','EDUCATIVO_LOCAL_API_VERIFIED','EDUCATIVO_EXAM_UNIT_ID')
function Set-ExamPollingPrivateValue([string]$name, [string]$label) {
  $examPollingSecure = Read-Host $label -AsSecureString
  $examPollingPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($examPollingSecure)
  try {
    [Environment]::SetEnvironmentVariable($name, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($examPollingPointer), 'Process')
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($examPollingPointer)
    $examPollingSecure.Dispose()
  }
}
try {
  $env:APP_ENV = 'test'
  $env:SUPABASE_URL = 'https://gwdtlbisykzzplgzczzq.supabase.co'
  $env:EDUCATIVO_API_URL = 'http://127.0.0.1:3000'
  Write-Host 'Educativo IA 03C polling. Backend local ya debe estar iniciado contra Supabase test. No usa POST de generacion.'
  $env:EDUCATIVO_LOCAL_API_VERIFIED = Read-Host 'Backend local verificado contra test: escriba confirmed'
  $env:EDUCATIVO_SYNTHETIC_USERS = Read-Host 'A/B existentes, distintos, sinteticos y exclusivos para pruebas: escriba confirmed'
  Set-ExamPollingPrivateValue 'EDUCATIVO_PUBLIC_KEY' 'Clave PUBLICA test (entrada oculta)'
  foreach ($examPollingActor in @('A','B')) {
    Set-ExamPollingPrivateValue "EDUCATIVO_${examPollingActor}_ID" "UUID sintetico $examPollingActor (entrada oculta)"
    Set-ExamPollingPrivateValue "EDUCATIVO_${examPollingActor}_TOKEN" "Access token test vigente de $examPollingActor (entrada oculta)"
  }
  & node (Join-Path $PSScriptRoot 'exam-polling-run.js')
  $examPollingExitCode = $LASTEXITCODE
  if ($examPollingExitCode -ne 0) { Write-Host '03C polling: ejecucion inconclusa o con residuos; conservar RUN/UNCERTAIN/RESIDUAL sin compartir credenciales.' }
} catch {
  $examPollingExitCode = 1
  Write-Host '03C polling: no se completo el arranque o la ejecucion. Revisar la guia sin compartir errores del proveedor.'
} finally {
  foreach ($examPollingName in $examPollingNames) { [Environment]::SetEnvironmentVariable($examPollingName, $null, 'Process') }
}
exit $examPollingExitCode

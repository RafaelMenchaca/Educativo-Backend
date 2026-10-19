# Run manually in a dedicated PowerShell terminal. Never dot-source this script.
# No .env/config.local.js reads. No credentials in command arguments or files.
$ErrorActionPreference = 'Stop'
$bibliotecaExitCode = 1
$bibliotecaNames = @('APP_ENV','SUPABASE_URL','EDUCATIVO_API_URL','EDUCATIVO_PUBLIC_KEY',
  'EDUCATIVO_A_ID','EDUCATIVO_B_ID','EDUCATIVO_A_TOKEN','EDUCATIVO_B_TOKEN',
  'EDUCATIVO_SYNTHETIC_USERS','EDUCATIVO_LOCAL_API_VERIFIED')
function Set-BibliotecaPrivateValue([string]$name, [string]$label) {
  $secure = Read-Host $label -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Environment]::SetEnvironmentVariable($name, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer), 'Process') }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secure.Dispose() }
}
try {
  $env:APP_ENV = 'test'
  $env:SUPABASE_URL = 'https://gwdtlbisykzzplgzczzq.supabase.co'
  $env:EDUCATIVO_API_URL = 'http://127.0.0.1:3000'
  Write-Host 'Educativo IA 03D2A Biblioteca. Backend local ya debe apuntar a test. No usa generacion, jerarquia, workers, Storage ni OpenAI.'
  $env:EDUCATIVO_LOCAL_API_VERIFIED = Read-Host 'Backend local verificado contra test: escriba confirmed'
  $env:EDUCATIVO_SYNTHETIC_USERS = Read-Host 'A/B distintos, sinteticos y exclusivos para pruebas: escriba confirmed'
  Set-BibliotecaPrivateValue 'EDUCATIVO_PUBLIC_KEY' 'Clave PUBLICA test (entrada oculta)'
  foreach ($actor in @('A','B')) {
    Set-BibliotecaPrivateValue "EDUCATIVO_${actor}_ID" "UUID sintetico $actor (entrada oculta)"
    Set-BibliotecaPrivateValue "EDUCATIVO_${actor}_TOKEN" "Access token test vigente de $actor (entrada oculta)"
  }
  & node (Join-Path $PSScriptRoot 'biblioteca-run.js')
  $bibliotecaExitCode = $LASTEXITCODE
  if ($bibliotecaExitCode -ne 0) { Write-Host '03D2A: ejecucion fallida, inconclusa o con residuos; conservar salida sanitizada.' }
} catch {
  $bibliotecaExitCode = 1
  Write-Host '03D2A: no se completo el arranque. Revisar la guia sin compartir errores del proveedor.'
} finally {
  foreach ($name in $bibliotecaNames) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
}
exit $bibliotecaExitCode

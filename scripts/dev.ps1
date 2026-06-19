$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'project-management-system'

function Start-DevProcess {
  param(
    [string] $Name,
    [string] $WorkingDirectory
  )

  Write-Host "Starting $Name..."
  Start-Process -FilePath 'npm.cmd' `
    -ArgumentList 'run', 'dev' `
    -WorkingDirectory $WorkingDirectory `
    -WindowStyle Hidden
}

Start-DevProcess -Name 'Backend' -WorkingDirectory $backend
Start-DevProcess -Name 'Frontend' -WorkingDirectory $frontend

Write-Host ''
Write-Host 'Frontend: http://localhost:3000'
Write-Host 'Backend:  http://localhost:5000/health'
Write-Host ''
Write-Host 'Tip: the first Next.js page load in dev mode can still compile once; refresh after it finishes.'

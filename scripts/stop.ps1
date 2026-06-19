$ErrorActionPreference = 'SilentlyContinue'

$ports = @(3000, 5000)
$connections = Get-NetTCPConnection -LocalPort $ports |
  Where-Object { $_.State -eq 'Listen' -and $_.OwningProcess }

$processIds = $connections |
  Select-Object -ExpandProperty OwningProcess -Unique

if (-not $processIds) {
  Write-Host 'No frontend/backend dev servers found on ports 3000 or 5000.'
  exit 0
}

foreach ($processId in $processIds) {
  Write-Host "Stopping process $processId..."
  Stop-Process -Id $processId -Force
}

Write-Host 'Stopped local dev servers.'

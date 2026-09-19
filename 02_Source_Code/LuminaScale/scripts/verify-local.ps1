$ErrorActionPreference = 'Stop'

$health = Invoke-RestMethod -Uri 'http://localhost:3000/health'
if ($health.status -ne 'ok') { throw 'API health check failed' }

$headers = @{ 'x-api-key' = if ($env:API_KEY) { $env:API_KEY } else { 'local-demo-key' } }
$summary = Invoke-RestMethod -Uri 'http://localhost:3000/api/summary' -Headers $headers
if ($summary.events -lt 1) { throw 'No telemetry events have been processed yet' }

$body = @{
  buildingId = 'building-1'
  apartmentId = 'apt-1'
  brightness = 55
} | ConvertTo-Json
$command = Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/api/commands' -Headers $headers -ContentType 'application/json' -Body $body
if (-not $command.command.commandId) { throw 'Manual command did not return a command ID' }

[pscustomobject]@{
  Api = $health.status
  Devices = $summary.devices
  Events = $summary.events
  ActiveRules = $summary.activeRules
  ManualCommandId = $command.command.commandId
}


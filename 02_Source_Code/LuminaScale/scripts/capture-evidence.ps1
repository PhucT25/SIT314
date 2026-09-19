param(
  [string]$OutputDirectory = 'evidence'
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$headers = @{ 'x-api-key' = if ($env:API_KEY) { $env:API_KEY } else { 'local-demo-key' } }

Invoke-RestMethod -Uri 'http://localhost:3000/api/summary' -Headers $headers |
  ConvertTo-Json -Depth 10 |
  Set-Content -LiteralPath (Join-Path $OutputDirectory 'summary.json') -Encoding utf8

docker compose ps --format json |
  Set-Content -LiteralPath (Join-Path $OutputDirectory 'containers.json') -Encoding utf8

docker compose logs --no-color --since 15m ingestion processor api node-red |
  Set-Content -LiteralPath (Join-Path $OutputDirectory 'service-logs.txt') -Encoding utf8

Write-Output "Evidence written to $((Resolve-Path $OutputDirectory).Path)"


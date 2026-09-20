<#
.SYNOPSIS
  Round-trips fixtures/declarations.sample.json through a deployed Merge Lab API:
  POST /v1/declarations, then GET /v1/context, and checks every posted symbol
  came back. Uses a unique throwaway repo so it never collides with real data.

.EXAMPLE
  ./smoke-test.ps1 -ApiUrl "https://abc123.execute-api.ap-south-1.amazonaws.com" -Token "my-token"
#>
param(
  [Parameter(Mandatory = $true)] [string]$ApiUrl,
  [Parameter(Mandatory = $true)] [string]$Token
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$samplePath = Join-Path $here "../fixtures/declarations.sample.json"
$sample = Get-Content $samplePath -Raw | ConvertFrom-Json

$repo = "smoke/$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
$headers = @{ Authorization = "Bearer $Token"; "content-type" = "application/json" }

# Reduce each sample Contract to a Declaration (names/types only), dropping null optionals.
$declarations = foreach ($c in $sample) {
  $d = [ordered]@{
    kind       = $c.kind
    symbol     = $c.symbol
    provides   = @($c.provides)
    consumes   = @($c.consumes)
    deps       = @($c.deps)
    source_ref = $c.source_ref
    origin     = $c.origin
    confidence = $c.confidence
  }
  if ($null -ne $c.signature) { $d.signature = $c.signature }
  if ($null -ne $c.shape) { $d.shape = $c.shape }
  $d
}

$body = @{
  schema_version = 1
  repo           = $repo
  branch         = "smoke"
  owner          = "smoke-bot"
  origin         = "manual"
  declarations   = @($declarations)
} | ConvertTo-Json -Depth 12

Write-Host "POST $ApiUrl/v1/declarations  (repo=$repo, $($declarations.Count) declarations)"
$post = Invoke-RestMethod -Method Post -Uri "$ApiUrl/v1/declarations" -Headers $headers -Body $body
Write-Host "  -> wrote $($post.contracts.Count) contracts"

$encodedRepo = [uri]::EscapeDataString($repo)
Write-Host "GET  $ApiUrl/v1/context?repo=$encodedRepo"
$get = Invoke-RestMethod -Method Get -Uri "$ApiUrl/v1/context?repo=$encodedRepo" -Headers $headers

$expected = $declarations | ForEach-Object { $_.symbol } | Sort-Object -Unique
$actual = @($get.contracts | ForEach-Object { $_.symbol }) | Sort-Object -Unique
$missing = $expected | Where-Object { $_ -notin $actual }

Write-Host ""
if ($missing.Count -eq 0) {
  Write-Host "PASS: all $($expected.Count) symbols round-tripped" -ForegroundColor Green
  exit 0
}
else {
  Write-Host "FAIL: missing $($missing -join ', ')" -ForegroundColor Red
  exit 1
}

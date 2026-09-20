$ErrorActionPreference = "Stop"

$baseDir = Get-Location
$demoBase = Join-Path $baseDir "demo-orders"
$devA = Join-Path $baseDir "demo-orders-dev-a"
$devB = Join-Path $baseDir "demo-orders-dev-b"

Write-Host "Cleaning up old demo directories..."
if (Test-Path $demoBase) { Remove-Item -Recurse -Force $demoBase }
if (Test-Path $devA) { Remove-Item -Recurse -Force $devA }
if (Test-Path $devB) { Remove-Item -Recurse -Force $devB }

Write-Host "Creating base demo-orders repository..."
New-Item -ItemType Directory -Path $demoBase | Out-Null
Set-Location $demoBase
git init | Out-Null
Set-Content -Path "README.md" -Value "# Demo Orders`n`nScaffold repository for the Merge Lab demo."
git add README.md
git commit -m "Initial scaffold commit" | Out-Null

Set-Location $baseDir

Write-Host "Cloning for Dev A..."
git clone $demoBase $devA | Out-Null
Set-Location $devA
git checkout -b feat/user-api | Out-Null

# Seed uncommitted work for Dev A
Copy-Item -Path (Join-Path $baseDir "fixtures/repo-a/*") -Destination $devA -Recurse
Set-Content -Path "package.json" -Value '{
  "name": "demo-orders",
  "dependencies": {
    "axios": "^1.7.0",
    "express": "^4.19.0"
  }
}'

Set-Location $baseDir

Write-Host "Cloning for Dev B..."
git clone $demoBase $devB | Out-Null
Set-Location $devB
git checkout -b feat/profile-ui | Out-Null

# Seed uncommitted work for Dev B
Copy-Item -Path (Join-Path $baseDir "fixtures/repo-b/*") -Destination $devB -Recurse
Set-Content -Path "package.json" -Value '{
  "name": "demo-orders",
  "dependencies": {
    "axios": "^1.7.0"
  }
}'

Set-Location $baseDir

Write-Host "Demo repositories created successfully!"
Write-Host "  - Dev A (feat/user-api): $devA"
Write-Host "  - Dev B (feat/profile-ui): $devB"

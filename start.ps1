$ErrorActionPreference = "Stop"
$backend = Join-Path $PSScriptRoot "backend"

if (-not (Test-Path (Join-Path $backend "node_modules\express"))) {
    Write-Host "Installing backend dependencies..."
    npm.cmd --prefix $backend install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Set-Location $backend
Write-Host "Starting Sentinel-X at http://localhost:3000"
npm.cmd start

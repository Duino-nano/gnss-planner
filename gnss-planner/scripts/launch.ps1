param([switch]$Lan, [switch]$Https)
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectPath
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Node.js 22 or later is required. Install it from https://nodejs.org/ and try again.' }
$serverArgs = @('server.mjs')
if ($Lan) { $serverArgs += '--lan' }
if ($Https) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectPath 'certs/local.pfx'))) { throw 'Run scripts/setup-https.ps1 first. See README.md.' }
    $serverArgs += '--https'
}
Write-Host 'Keep this window open. Press Ctrl+C to stop GNSS FIELD.'
& $nodePath @serverArgs

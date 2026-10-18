# Windows PowerShell: dot-source from the project root to affect this terminal.
# . .\scripts\use-node24.ps1
if ($MyInvocation.InvocationName -ne '.') {
  throw 'Dot-source this script: . .\scripts\use-node24.ps1 (current terminal only).'
}
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
  throw 'This helper is for Windows. Use your version manager with .nvmrc on other platforms.'
}

$taskProjectRoot = Split-Path -Parent $PSScriptRoot
$taskPinnedNode = (Get-Content -Raw -LiteralPath (Join-Path $taskProjectRoot '.nvmrc') -ErrorAction Stop).Trim()
if ($taskPinnedNode -notmatch '^24\.\d+\.\d+$') {
  throw '.nvmrc must contain an exact Node 24 version, such as 24.22.0.'
}
$taskNodeRuntime = Join-Path $taskProjectRoot ('.recall/runtime/node-v' + $taskPinnedNode + '-win-x64')
$taskNodeExecutable = Join-Path $taskNodeRuntime 'node.exe'
$taskNpmExecutable = Join-Path $taskNodeRuntime 'npm.cmd'
if (!(Test-Path -LiteralPath $taskNodeExecutable -PathType Leaf) -or !(Test-Path -LiteralPath $taskNpmExecutable -PathType Leaf)) {
  throw ('Portable Node ' + $taskPinnedNode + ' is missing. Follow docs/DEPLOYMENT_CI.md (Windows local activation), or install/select that version with nvm-windows. No fallback was selected.')
}
$taskReportedNode = & $taskNodeExecutable --version
if ($LASTEXITCODE -ne 0 -or $taskReportedNode -cne ('v' + $taskPinnedNode)) {
  throw ('The local binary must report v' + $taskPinnedNode + '. PATH was not changed.')
}

$taskNodeRuntime = (Resolve-Path -LiteralPath $taskNodeRuntime -ErrorAction Stop).Path
$taskPriorPath = $env:Path
$taskPriorPathParts = @($taskPriorPath -split ';' | Where-Object {
  ![String]::Equals($_.Replace('/', '\').TrimEnd('\'), $taskNodeRuntime.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)
})
$env:Path = (@($taskNodeRuntime) + $taskPriorPathParts) -join ';'
$taskSelectedNode = Get-Command node -ErrorAction SilentlyContinue
if (!$taskSelectedNode -or $taskSelectedNode.CommandType -ne 'Application' -or ![String]::Equals($taskSelectedNode.Source, $taskNodeExecutable, [StringComparison]::OrdinalIgnoreCase)) {
  $env:Path = $taskPriorPath
  throw 'A node alias/function or command override prevents activation. PATH was restored; remove that override in this terminal and retry.'
}
Write-Output ('Node v' + $taskPinnedNode + ' selected for this terminal only. Use npm.cmd for npm commands.')

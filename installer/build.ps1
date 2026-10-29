# Compiles EZI-Setup-<version>.exe from the folder installer/stage.sh prepared (PRD 11.7), then writes SHA256SUMS.txt.
# Run on Windows:  powershell -ExecutionPolicy Bypass -File C:\ezi-build\build.ps1
# Needs Inno Setup 6 or 7 (winget install JRSoftware.InnoSetup). No Node, Git or MariaDB needed on this PC.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

$iscc = @(
  "${env:ProgramFiles(x86)}\Inno Setup 7\ISCC.exe", "$env:ProgramFiles\Inno Setup 7\ISCC.exe", "$env:LOCALAPPDATA\Programs\Inno Setup 7\ISCC.exe",
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe", "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw "Inno Setup not found. Install it with: winget install JRSoftware.InnoSetup" }
if (-not (Test-Path "$root\stage\app\main.mjs")) { throw "Stage folder missing. Run installer/stage.sh in WSL first." }

& $iscc "$root\ezi.iss"
if ($LASTEXITCODE -ne 0) { throw "ISCC failed with exit code $LASTEXITCODE" }

$out = Join-Path $root "output"
Get-ChildItem $out -Filter "EZI-Setup-*.exe" | ForEach-Object {
  "{0}  {1}" -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower(), $_.Name
} | Set-Content -Encoding ascii (Join-Path $out "SHA256SUMS.txt")
Get-Content (Join-Path $out "SHA256SUMS.txt")
Write-Host "Installer: $out"

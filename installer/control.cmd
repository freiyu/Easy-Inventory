@echo off
rem EZI Start Menu tools (PRD 11.4): start, stop, backup, restore, address. Asks for administrator rights once.
setlocal
net session >nul 2>&1 || (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs"
  exit /b
)
set "BASE=%~dp0.."
title EZI Inventory
if /i "%~1"=="restore" goto restore
"%BASE%\node\node.exe" "%BASE%\app\cli.mjs" %*
echo.
pause
exit /b

:restore
set "FILE="
for /f "usebackq delims=" %%F in (`powershell -NoProfile -STA -Command "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.OpenFileDialog; $d.Title = 'Pilih file backup EZI'; $d.Filter = 'Backup EZI (*.sql.gz)|*.sql.gz'; $d.InitialDirectory = Join-Path $env:ProgramData 'EZI\backups'; if ($d.ShowDialog() -eq 'OK') { $d.FileName }"`) do set "FILE=%%F"
if not defined FILE (
  echo Dibatalkan. Tidak ada yang diubah.
  pause
  exit /b
)
"%BASE%\node\node.exe" "%BASE%\app\cli.mjs" restore "%FILE%"
echo.
pause

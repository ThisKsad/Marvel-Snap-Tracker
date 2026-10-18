# Installiert den Marvel Snap Tracker für den aktuellen Windows-Benutzer
$ErrorActionPreference = 'Stop'
$target = Join-Path $env:LOCALAPPDATA 'SnapTracker\app'
New-Item -ItemType Directory -Force -Path $target | Out-Null

# laufende Version beenden, damit die Dateien ersetzt werden können
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -like '*SnapTracker.ps1*' -and $_.ProcessId -ne $PID } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

foreach ($f in 'SnapTracker.ps1', 'SnapTrackerTray.ps1', 'Start.vbs') {
    Copy-Item -Force (Join-Path $PSScriptRoot $f) $target
}
Get-ChildItem $target | Unblock-File

$lnkPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'Marvel Snap Tracker.lnk'
$lnk = (New-Object -ComObject WScript.Shell).CreateShortcut($lnkPath)
$lnk.TargetPath = 'wscript.exe'
$lnk.Arguments = '"' + (Join-Path $target 'Start.vbs') + '"'
$lnk.WorkingDirectory = $target
$lnk.Description = 'Marvel Snap Tracker'
$lnk.Save()

Start-Process wscript.exe -ArgumentList ('"' + (Join-Path $target 'Start.vbs') + '"')
Write-Host ''
Write-Host 'Marvel Snap Tracker ist installiert und läuft (lila "S" unten rechts in der Taskleiste).'
Write-Host 'Er startet ab jetzt automatisch mit Windows.'

# Entfernt den Marvel Snap Tracker (gespeicherte Spiele in der Datenbank bleiben erhalten)
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -like '*SnapTracker.ps1*' -and $_.ProcessId -ne $PID } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Remove-Item (Join-Path ([Environment]::GetFolderPath('Startup')) 'Marvel Snap Tracker.lnk') -ErrorAction SilentlyContinue
Remove-Item (Join-Path $env:LOCALAPPDATA 'SnapTracker\app') -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'Marvel Snap Tracker wurde entfernt. Deine Spiele auf der Website bleiben erhalten.'

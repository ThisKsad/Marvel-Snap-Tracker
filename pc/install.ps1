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

# PIN abfragen und verschlüsselt speichern (nur dieser Windows-Benutzer kann ihn lesen)
Write-Host ''
Write-Host 'Gib den PIN ein, den du auf der Tracker-Website festgelegt hast.'
Write-Host '(Falls noch keiner festgelegt ist: zuerst die Website öffnen und dort einen PIN festlegen.)'
do {
    $p1 = Read-Host 'PIN' -AsSecureString
    $p2 = Read-Host 'PIN wiederholen' -AsSecureString
    $b1 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p1))
    $b2 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p2))
    $same = ($b1 -eq $b2) -and ($b1.Length -ge 4)
    if (-not $same) { Write-Host 'Die Eingaben stimmen nicht überein oder sind kürzer als 4 Zeichen. Bitte nochmal.' -ForegroundColor Yellow }
} until ($same)
$dataDir = Join-Path $env:LOCALAPPDATA 'SnapTracker'
$p1 | ConvertFrom-SecureString | Set-Content (Join-Path $dataDir 'pin.dat')
$b1 = $null; $b2 = $null

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

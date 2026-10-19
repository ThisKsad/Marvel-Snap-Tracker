# Marvel Snap Tracker - PC-Programm
# Läuft im Hintergrund (Symbol im Infobereich der Taskleiste), erkennt das Ende jeder
# Marvel-Snap-Partie und schickt sie an die Tracker-Datenbank.
# Läuft mit dem in Windows eingebauten PowerShell 5.1, keine Installation nötig.

param(
    [switch]$Once,              # nur einmal prüfen und beenden (zum Testen)
    [string]$GameStatePath,     # anderer Pfad zur GameState.json (zum Testen)
    [string]$DataDir            # anderer Ordner für Log und Liste gesendeter Spiele
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------- Einstellungen
$SupabaseUrl = 'https://dwsieddjvldzurosjdpp.supabase.co'
if ($env:SNAPTRACKER_URL) { $SupabaseUrl = $env:SNAPTRACKER_URL }   # nur zum Testen
$SupabaseKey = 'sb_publishable_SREC_XokfKppXeP7rTgnMQ_-2ZyEXMp'   # öffentlicher Schlüssel
$SiteUrl     = 'https://thisksad.github.io/Marvel-Snap-Tracker/'
$IntervalSec = 5

if (-not $GameStatePath) {
    $GameStatePath = Join-Path $env:USERPROFILE 'AppData\LocalLow\Second Dinner\SNAP\Standalone\States\nvprod\GameState.json'
}
if (-not $DataDir) {
    $DataDir = Join-Path $env:LOCALAPPDATA 'SnapTracker'
}
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
$SentFile = Join-Path $DataDir 'gesendet.txt'
$LogFile  = Join-Path $DataDir 'log.txt'
$PinFile  = Join-Path $DataDir 'pin.dat'

# PIN steht verschlüsselt (nur für diesen Windows-Benutzer lesbar) in pin.dat, angelegt von install.ps1
function Get-TrackerPin {
    if ($env:SNAPTRACKER_PIN) { return $env:SNAPTRACKER_PIN }   # nur zum Testen
    if (-not (Test-Path $PinFile)) { return $null }
    try {
        $sec = (Get-Content $PinFile -Raw).Trim() | ConvertTo-SecureString
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
        try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    } catch {
        Write-Log "PIN konnte nicht gelesen werden: $($_.Exception.Message)"
        return $null
    }
}

try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

function Write-Log([string]$msg) {
    $line = '{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $msg
    try {
        Add-Content -Path $LogFile -Value $line -Encoding UTF8
        # Log klein halten
        if ((Get-Item $LogFile).Length -gt 512KB) {
            $keep = Get-Content $LogFile -Encoding UTF8 | Select-Object -Last 500
            Set-Content -Path $LogFile -Value $keep -Encoding UTF8
        }
    } catch {}
    if ($Once) { Write-Host $line }
}

$script:Sent = New-Object 'System.Collections.Generic.HashSet[string]'
if (Test-Path $SentFile) {
    foreach ($l in (Get-Content $SentFile -Encoding UTF8)) { if ($l) { [void]$script:Sent.Add($l.Trim()) } }
}
$script:LastWrite = [datetime]::MinValue
$script:Status = 'Wartet auf die erste Partie'
$script:Pin = Get-TrackerPin
$script:PinProblem = $false          # true = falscher PIN, nicht weiter senden (sonst sperrt die Datenbank)
$script:PauseUntil = [datetime]::MinValue
$script:Alert = $null                # Warnung, die das Symbol einmal als Meldung zeigt

function Read-SharedText([string]$path) {
    # Datei lesen, auch wenn das Spiel sie gerade offen hat
    $fs = [IO.File]::Open($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete)
    try {
        $sr = New-Object IO.StreamReader($fs, [Text.Encoding]::UTF8, $true)
        return $sr.ReadToEnd()
    } finally { $fs.Dispose() }
}

function Format-Result($r) {
    $res = switch ($r.result) { 'win' { 'Sieg' } 'loss' { 'Niederlage' } default { 'Unentschieden' } }
    $c = [int]$r.cubes
    $cubes = if ($c -gt 0) { "+$c" } else { "$c" }
    $deck = if ($r.deck) { " mit $($r.deck)" } else { '' }
    return "$res $cubes Cubes$deck"
}

# Prüft die Spieldatei einmal. Gibt eine Meldung zurück, wenn ein neues Spiel gesendet wurde.
function Invoke-SnapCheck {
    if ($script:PinProblem) { return $null }
    if (-not $script:Pin) {
        if ($script:Status -notlike 'Kein PIN*') { Write-Log 'Kein PIN hinterlegt, es wird nichts gesendet' }
        $script:Status = 'Kein PIN hinterlegt. Bitte Installieren.bat erneut ausführen.'
        return $null
    }
    if ((Get-Date) -lt $script:PauseUntil) { return $null }
    if (-not (Test-Path $GameStatePath)) { $script:Status = 'Spieldatei nicht gefunden'; return $null }
    $info = Get-Item $GameStatePath
    if ($info.LastWriteTimeUtc -eq $script:LastWrite) { return $null }

    $text = $null
    for ($i = 0; $i -lt 3 -and -not $text; $i++) {
        try { $text = Read-SharedText $GameStatePath } catch { Start-Sleep -Milliseconds 700 }
    }
    if (-not $text) { return $null }

    # Nur fertige Partien haben eine ClientResultMessage mit GameId
    $m = [regex]::Match($text, '"ClientResultMessage"\s*:\s*\{[^{}]*?"GameId"\s*:\s*"([^"]+)"')
    if (-not $m.Success) { $script:LastWrite = $info.LastWriteTimeUtc; return $null }
    $gameId = $m.Groups[1].Value
    if ($script:Sent.Contains($gameId)) { $script:LastWrite = $info.LastWriteTimeUtc; return $null }

    # Ist die Datei vollständig geschrieben? Sonst beim nächsten Durchlauf erneut versuchen.
    $trim = $text.TrimEnd()
    if (-not $trim.EndsWith('}')) { return $null }
    $trim = $trim.TrimStart([char]0xFEFF)

    $pinJson = ConvertTo-Json ([string]$script:Pin)
    $body = [Text.Encoding]::UTF8.GetBytes('{"pin":' + $pinJson + ',"payload":' + $trim + '}')
    $headers = @{ apikey = $SupabaseKey; Authorization = "Bearer $SupabaseKey" }
    try {
        $r = Invoke-RestMethod -Method Post -Uri "$SupabaseUrl/rest/v1/rpc/snap_ingest" `
            -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 30
    } catch {
        $script:Status = 'Senden fehlgeschlagen, neuer Versuch folgt'
        Write-Log "Fehler beim Senden von $gameId : $($_.Exception.Message)"
        return $null   # LastWrite nicht setzen -> nächster Durchlauf versucht es erneut
    }

    if ($r.status -eq 'wrong_pin' -or $r.status -eq 'no_pin') {
        $script:PinProblem = $true
        $script:Status = 'PIN falsch. Bitte Installieren.bat erneut ausführen.'
        $script:Alert = 'Der gespeicherte PIN stimmt nicht. Spiele werden nicht gesendet. Bitte Installieren.bat erneut ausführen und den PIN der Website eingeben.'
        Write-Log "PIN abgelehnt ($($r.status)), Senden gestoppt"
        return $null
    }
    if ($r.status -eq 'locked') {
        $script:PauseUntil = (Get-Date).AddMinutes(11)
        $script:Status = 'Datenbank wegen falscher PIN-Eingaben kurz gesperrt, neuer Versuch in 11 Minuten'
        Write-Log 'Datenbank gesperrt (zu viele falsche PINs), Pause 11 Minuten'
        return $null
    }

    $script:LastWrite = $info.LastWriteTimeUtc
    if ($r.status -eq 'inserted' -or $r.status -eq 'duplicate') {
        [void]$script:Sent.Add($gameId)
        Add-Content -Path $SentFile -Value $gameId -Encoding UTF8
    }
    if ($r.status -eq 'inserted') {
        $msg = Format-Result $r
        $script:Status = "Zuletzt: $msg ({0:HH:mm})" -f (Get-Date)
        Write-Log "Gespeichert $gameId : $msg"
        return $msg
    }
    Write-Log "Antwort für $gameId : $($r.status)"
    return $null
}

# ---------------------------------------------------------------- Testmodus
if ($Once) {
    $msg = Invoke-SnapCheck
    Write-Host "Status: $script:Status"
    if ($msg) { Write-Host "Neu: $msg" }
    return
}

# ---------------------------------------------------------------- Hintergrundbetrieb mit Symbol
. (Join-Path $PSScriptRoot 'SnapTrackerTray.ps1')

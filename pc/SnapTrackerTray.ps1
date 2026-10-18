# Marvel Snap Tracker - Symbol im Infobereich (wird von SnapTracker.ps1 geladen)

# ---------------------------------------------------------------- Nur eine Instanz
$created = $false
$mutex = New-Object Threading.Mutex($true, 'Local\MarvelSnapTracker', [ref]$created)
if (-not $created) { return }

# ---------------------------------------------------------------- Symbol im Infobereich
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$icon = New-Object Windows.Forms.NotifyIcon
$bmp = New-Object Drawing.Bitmap 32, 32
$gfx = [Drawing.Graphics]::FromImage($bmp)
$gfx.SmoothingMode = 'AntiAlias'
$gfx.FillEllipse((New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(255, 124, 58, 237))), 1, 1, 30, 30)
$font = New-Object Drawing.Font('Segoe UI', 15, [Drawing.FontStyle]::Bold, [Drawing.GraphicsUnit]::Pixel)
$fmt = New-Object Drawing.StringFormat
$fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
$gfx.DrawString('S', $font, [Drawing.Brushes]::White, (New-Object Drawing.RectangleF(0, 0, 32, 32)), $fmt)
$icon.Icon = [Drawing.Icon]::FromHandle($bmp.GetHicon())
$icon.Text = 'Marvel Snap Tracker'
$icon.Visible = $true

$menu = New-Object Windows.Forms.ContextMenuStrip
$statusItem = $menu.Items.Add('Wartet auf die erste Partie')
$statusItem.Enabled = $false
[void]$menu.Items.Add('-')
$openItem = $menu.Items.Add('Tracker öffnen')
$openItem.add_Click({ Start-Process $SiteUrl })
$checkItem = $menu.Items.Add('Jetzt prüfen')
$checkItem.add_Click({ $script:LastWrite = [datetime]::MinValue; Invoke-Tick })
$logItem = $menu.Items.Add('Log anzeigen')
$logItem.add_Click({ if (Test-Path $LogFile) { Start-Process notepad.exe $LogFile } })
[void]$menu.Items.Add('-')
$quitItem = $menu.Items.Add('Beenden')
$quitItem.add_Click({ $timer.Stop(); $icon.Visible = $false; $icon.Dispose(); [Windows.Forms.Application]::Exit() })
$icon.ContextMenuStrip = $menu
$icon.add_DoubleClick({ Start-Process $SiteUrl })

function Invoke-Tick {
    try {
        $msg = Invoke-SnapCheck
        if ($msg) { $icon.ShowBalloonTip(4000, 'Marvel Snap Tracker', "Gespeichert: $msg", 'Info') }
        if ($script:Alert) { $icon.ShowBalloonTip(8000, 'Marvel Snap Tracker', $script:Alert, 'Warning'); $script:Alert = $null }
    } catch {
        Write-Log "Unerwarteter Fehler: $($_.Exception.Message)"
    }
    $t = $script:Status
    $statusItem.Text = $t
    $icon.Text = ('Marvel Snap Tracker - ' + $t).Substring(0, [Math]::Min(63, ('Marvel Snap Tracker - ' + $t).Length))
}

$timer = New-Object Windows.Forms.Timer
$timer.Interval = $IntervalSec * 1000
$timer.add_Tick({ Invoke-Tick })
$timer.Start()

Write-Log 'Tracker gestartet'
Invoke-Tick
[Windows.Forms.Application]::Run()
$mutex.ReleaseMutex()

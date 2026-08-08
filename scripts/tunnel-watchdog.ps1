# Tunnel watchdog — runs tunnel-launch.js (captures URL, auto-restarts)
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$NodeExe = 'C:\Program Files\nodejs\node.exe'
$Launcher = Join-Path $ProjectRoot 'server\src\tunnel-launch.js'
$LogFile = Join-Path $ProjectRoot 'logs\tunnel.log'
while ($true) {
    try {
        & $NodeExe $Launcher 2>&1 | Add-Content $LogFile
    } catch {
        Add-Content $LogFile "Tunnel watchdog restart: $_"
    }
    Start-Sleep -Seconds 5
}
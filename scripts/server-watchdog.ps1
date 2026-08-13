# Server watchdog — auto-restarts the Node server if it crashes
# 端口 3001：避免与本机其他项目(如 Mineradio 占用 127.0.0.1:3000)冲突
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$env:PORT = '3001'
$env:DATA_DIR = Join-Path $ProjectRoot 'server\data'
$NodeExe = 'C:\Program Files\nodejs\node.exe'
$ServerEntry = Join-Path $ProjectRoot 'server\src\index.js'
$LogFile = Join-Path $ProjectRoot 'logs\server.log'
while ($true) {
    try {
        & $NodeExe $ServerEntry 2>&1 | Add-Content $LogFile
    } catch {
        Add-Content $LogFile "Watchdog restart: $_"
    }
    Start-Sleep -Seconds 3
}
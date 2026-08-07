<#
.SYNOPSIS
  Andy 工作台 — 启动所有服务（后台运行）
  启动 Node 后端 + SQLite + WebSocket + Cloudflare Tunnel
.DESCRIPTION
  以无窗口后台方式运行。使用 Windows 任务计划程序实现开机自启动。
  -InstallService: 注册任务计划程序开机自启动
  -UninstallService: 移除自启动任务
  -Status: 查看服务状态
#>
param(
    [switch]$InstallService,
    [switch]$UninstallService,
    [switch]$Status
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$LogsDir = Join-Path $ProjectRoot "logs"
$NodeExe = "C:\Program Files\nodejs\node.exe"
$ServerDir = Join-Path $ProjectRoot "server"
$TaskName = "AndyWorkbench"
$PwshExe = "C:\Program Files\PowerShell\7\pwsh.exe"

if (-not (Test-Path $LogsDir)) { New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null }

# ---- Status ----
if ($Status) {
    & "$PSScriptRoot\status-workbench.ps1"
    return
}

# ---- Uninstall ----
if ($UninstallService) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "[OK] 已移除开机自启动任务" -ForegroundColor Green
    return
}

# ---- Install Service ----
if ($InstallService) {
    $action = New-ScheduledTaskAction -Execute $PwshExe `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\start-workbench.ps1`"" `
        -WorkingDirectory $ProjectRoot

    $trigger = New-ScheduledTaskTrigger -AtStartup
    $settings = New-ScheduledTaskSettingsSet `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -ExecutionTimeLimit 0 `
        -Priority 6

    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest -LogonType ServiceAccount

    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

    Write-Host "[OK] 已注册开机自启动任务: $TaskName" -ForegroundColor Green
    Write-Host "     任务名: $TaskName" -ForegroundColor Cyan
    Write-Host "     启动后自动运行: Node 后端 + Cloudflare Tunnel" -ForegroundColor Cyan
    Write-Host "     日志路径: $LogsDir" -ForegroundColor Cyan
    return
}

# ---- Normal Start ----
Write-Host "Andy 工作台启动中..." -ForegroundColor Cyan

# 1. Kill any existing instances on port 3000
$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    $pids = $conn | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pid in $pids) { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
}

# 2. Start Node.js backend (auto-restart via watchdog)
$serverLog = Join-Path $LogsDir "server.log"
$watchdogScript = @"
`$LogFile = '$serverLog'
`$NodeExe = '$NodeExe'
`$ServerEntry = '$ServerDir\src\index.js'
`$ServerDir = '$ServerDir'
while (`$true) {
    try {
        `$env:PORT = '3000'
        `$env:DATA_DIR = Join-Path '$ServerDir' 'data'
        & `$NodeExe `$ServerEntry 2>&1 | Out-File -FilePath `$LogFile -Append
    } catch {
        Add-Content -Path `$LogFile -Value "Watchdog restart: `$_"
    }
    Start-Sleep -Seconds 3
}
"@
$watchdogFile = Join-Path $LogsDir "server-watchdog.ps1"
Set-Content -Path $watchdogFile -Value $watchdogScript -Encoding UTF8

$serverProc = Start-Process -FilePath $PwshExe `
    -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$watchdogFile`"" `
    -WindowStyle Hidden -WorkingDirectory $ServerDir -PassThru
Write-Host "[OK] 后端服务启动中 (PID: $($serverProc.Id))" -ForegroundColor Green

# 3. Wait for server to be ready
Start-Sleep -Seconds 3

# 4. Start Cloudflare Tunnel
$tunnelScript = @"
`$NodeExe = '$NodeExe'
`$TunnelLauncher = '$ServerDir\src\tunnel-launch.js'
`$ServerDir = '$ServerDir'
while (`$true) {
    try {
        & `$NodeExe `$TunnelLauncher 2>&1 | Out-File -FilePath '$LogsDir\tunnel.log' -Append
    } catch {
        Add-Content -Path '$LogsDir\tunnel.log' -Value "Tunnel watchdog restart: `$_"
    }
    Start-Sleep -Seconds 5
}
"@
$tunnelWatchdog = Join-Path $LogsDir "tunnel-watchdog.ps1"
Set-Content -Path $tunnelWatchdog -Value $tunnelScript -Encoding UTF8

$tunnelProc = Start-Process -FilePath $PwshExe `
    -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$tunnelWatchdog`"" `
    -WindowStyle Hidden -WorkingDirectory $ProjectRoot -PassThru

# 5. Wait for tunnel URL
Start-Sleep -Seconds 8
$tunnelUrl = Get-Content (Join-Path $LogsDir "current-tunnel-url.txt") -ErrorAction SilentlyContinue

# 6. Verify
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 5 -UseBasicParsing
    Write-Host "[OK] 服务就绪: $($health.data.students) 学员, $($health.data.leads) 意向" -ForegroundColor Green
} catch {
    Write-Host "[警告] 服务可能尚未完全就绪，请稍后访问 http://localhost:3000" -ForegroundColor Yellow
}

Write-Host "[OK] 隧道进程已启动 (PID: $($tunnelProc.Id))" -ForegroundColor Green
if ($tunnelUrl) {
    Write-Host "[OK] 公网地址: $tunnelUrl" -ForegroundColor Green
    Write-Host "     手机在外网访问此地址即可使用" -ForegroundColor Cyan
}
Write-Host "[OK] 本机访问地址: http://localhost:3000" -ForegroundColor Cyan
Write-Host "[OK] 日志路径: $LogsDir" -ForegroundColor Gray
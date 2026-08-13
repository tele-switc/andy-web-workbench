<#
.SYNOPSIS
  Andy 工作台 — 停止所有相关进程
.DESCRIPTION
  停止 Node 后端、cloudflared 隧道及其看门狗进程
#>
$ErrorActionPreference = "SilentlyContinue"

Write-Host "正在停止 Andy 工作台..." -ForegroundColor Yellow

# 停止 Node 后端进程 (监听 3001 端口)
$conn = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    $pids = $conn | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pid in $pids) {
        Stop-Process -Id $pid -Force
        Write-Host "  已停止后端进程 PID: $pid" -ForegroundColor Green
    }
} else {
    Write-Host "  后端服务未在运行" -ForegroundColor Gray
}

# 停止 cloudflared
$cf = Get-Process cloudflared -ErrorAction SilentlyContinue
if ($cf) {
    Stop-Process -Name cloudflared -Force
    Write-Host "  已停止 cloudflared 隧道" -ForegroundColor Green
}

# 停止看门狗进程
$watchdogs = Get-CimInstance Win32_Process -Filter "Name='pwsh.exe'" | Where-Object {
    $_.CommandLine -match "logs\\watchdog"
}
foreach ($w in $watchdogs) {
    Stop-Process -Id $w.ProcessId -Force
    Write-Host "  已停止看门狗进程 PID: $($w.ProcessId)" -ForegroundColor Green
}

Write-Host "完成。服务已停止。" -ForegroundColor Green

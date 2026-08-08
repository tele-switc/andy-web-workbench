<#
.SYNOPSIS
  Andy 工作台 — 启动所有服务
  -InstallService : 注册开机自启动
  -UninstallService: 移除自启动任务
  -Status: 查看状态
#>
param(
    [switch]$InstallService,
    [switch]$UninstallService,
    [switch]$Status
)

$ProjectRoot = "E:\Projects\AndyWebWorkbench"
$LogsDir = Join-Path $ProjectRoot "logs"
$TaskName = "AndyWorkbench"

if (-not (Test-Path $LogsDir)) { New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null }

if ($Status) { & "$ProjectRoot\status-workbench.ps1"; return }

if ($UninstallService) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "[OK] 已移除开机自启动任务" -ForegroundColor Green
    return
}

if ($InstallService) {
    $action = New-ScheduledTaskAction -Execute "C:\Program Files\PowerShell\7\pwsh.exe" `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ProjectRoot\start-workbench.ps1`"" `
        -WorkingDirectory $ProjectRoot
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit 0
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
    Write-Host "[OK] 已注册开机自启动任务: $TaskName" -ForegroundColor Green
    return
}

# Normal start
Write-Host "Andy 工作台启动中..." -ForegroundColor Cyan

# Start server watchdog
$serverProc = Start-Process -FilePath "C:\Program Files\PowerShell\7\pwsh.exe" `
    -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "$ProjectRoot\scripts\server-watchdog.ps1" `
    -WindowStyle Hidden -PassThru
Write-Host "[OK] 后端服务启动中 (PID: $($serverProc.Id))" -ForegroundColor Green

Start-Sleep -Seconds 4

# Start tunnel watchdog
$tunnelProc = Start-Process -FilePath "C:\Program Files\PowerShell\7\pwsh.exe" `
    -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "$ProjectRoot\scripts\tunnel-watchdog.ps1" `
    -WindowStyle Hidden -PassThru
Write-Host "[OK] 远程隧道已启动 (PID: $($tunnelProc.Id))" -ForegroundColor Green

# Wait for tunnel URL
Start-Sleep -Seconds 10
$tunnelUrl = Get-Content "$LogsDir\current-tunnel-url.txt" -ErrorAction SilentlyContinue

# Verify
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 5 -UseBasicParsing
    Write-Host "[OK] 服务就绪: $($health.data.students) 学员, $($health.data.leads) 意向" -ForegroundColor Green
    if ($tunnelUrl) { Write-Host "[OK] 公网地址: $tunnelUrl" -ForegroundColor Green }
    Write-Host "[OK] 本机访问: http://localhost:3000" -ForegroundColor Cyan
} catch {
    Write-Host "[WARN] 服务可能尚未就绪，稍后访问 http://localhost:3000" -ForegroundColor Yellow
}
Write-Host "[OK] 日志路径: $LogsDir" -ForegroundColor Gray
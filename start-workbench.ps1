<#
.SYNOPSIS
  Andy 工作台 — 启动所有服务（Tailscale Funnel 公网方案）
  -InstallService : 注册开机自启动（登录时自动启动；无需管理员，写 Startup 文件夹）
  -UninstallService: 移除自启动
  -Status: 查看状态
#>
param(
    [switch]$InstallService,
    [switch]$UninstallService,
    [switch]$Status
)

$ProjectRoot = "E:\Projects\AndyWebWorkbench"
$LogsDir = Join-Path $ProjectRoot "logs"
$StartupDir = [Environment]::GetFolderPath('Startup')
$StartupLnk = Join-Path $StartupDir "AndyWorkbench.lnk"

if (-not (Test-Path $LogsDir)) { New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null }

if ($Status) { & "$ProjectRoot\status-workbench.ps1"; return }

if ($UninstallService) {
    Remove-Item $StartupLnk -Force -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName "AndyWorkbench" -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "[OK] 已移除开机自启动" -ForegroundColor Green
    return
}

if ($InstallService) {
    # 用 Startup 文件夹快捷方式实现开机自启（无需管理员权限）
    $ws = New-Object -ComObject WScript.Shell
    $sc = $ws.CreateShortcut($StartupLnk)
    $sc.TargetPath = "C:\Program Files\PowerShell\7\pwsh.exe"
    $sc.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ProjectRoot\start-workbench.ps1`""
    $sc.WorkingDirectory = $ProjectRoot
    $sc.Save()
    # 同时尝试注册计划任务（需要管理员时静默失败，不阻塞）
    try {
        $action = New-ScheduledTaskAction -Execute "C:\Program Files\PowerShell\7\pwsh.exe" `
            -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ProjectRoot\start-workbench.ps1`"" `
            -WorkingDirectory $ProjectRoot
        $trigger = New-ScheduledTaskTrigger -AtLogOn
        $settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit 0
        Register-ScheduledTask -TaskName "AndyWorkbench" -Action $action -Trigger $trigger -Settings $settings -Force -ErrorAction SilentlyContinue | Out-Null
        if (Get-ScheduledTask -TaskName "AndyWorkbench" -ErrorAction SilentlyContinue) {
            Write-Host "[OK] 已注册计划任务 AndyWorkbench（登录时自启）" -ForegroundColor Green
        } else {
            Write-Host "[OK] 已写入启动文件夹快捷方式（无需管理员）。" -ForegroundColor Green
        }
    } catch {
        Write-Host "[OK] 已写入启动文件夹快捷方式（无需管理员）。" -ForegroundColor Green
    }
    return
}

Write-Host "Andy 工作台启动中..." -ForegroundColor Cyan

# 0) 后端服务看门狗（自动重启 Node 服务）——先起后端，不阻塞
$serverProc = Start-Process -FilePath "C:\Program Files\PowerShell\7\pwsh.exe" `
    -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "$ProjectRoot\scripts\server-watchdog.ps1" `
    -WindowStyle Hidden -PassThru
Write-Host "[OK] 后端服务启动中 (PID: $($serverProc.Id))" -ForegroundColor Green

Start-Sleep -Seconds 4

# 1) Funnel 看门狗（保活 + 健康检查 + 固定公网地址）
$tunnelProc = Start-Process -FilePath "C:\Program Files\PowerShell\7\pwsh.exe" `
    -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "$ProjectRoot\scripts\funnel-watchdog.ps1" `
    -WindowStyle Hidden -PassThru
Write-Host "[OK] Funnel 公网服务启动中 (PID: $($tunnelProc.Id))" -ForegroundColor Green

# 2) 健康巡检（每5分钟，自动修复；启动即先跑一轮修复 Tailscale/Funnel，不阻塞本脚本）
$healthProc = Start-Process -FilePath "C:\Program Files\PowerShell\7\pwsh.exe" `
    -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "$ProjectRoot\scripts\health-check.ps1" `
    -WindowStyle Hidden -PassThru
Write-Host "[OK] 健康巡检启动中 (PID: $($healthProc.Id), 每5分钟)" -ForegroundColor Green

# 3) Tailscale 重连/登录放后台（由 health-check 循环处理），不再同步阻塞
try {
    $tsSetup = Start-Process -FilePath "C:\Program Files\PowerShell\7\pwsh.exe" `
        -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "$ProjectRoot\scripts\tailscale-setup.ps1" `
        -WindowStyle Hidden -PassThru
    Write-Host "[OK] Tailscale 重连已在后台处理 (PID: $($tsSetup.Id))" -ForegroundColor Green
} catch { }

# 4) 等待就绪并验证
Start-Sleep -Seconds 12
$publicUrl = Get-Content "$LogsDir\public-url.txt" -ErrorAction SilentlyContinue

try {
    $health = Invoke-RestMethod -Uri "http://localhost:3001/api/health" -TimeoutSec 5 -UseBasicParsing
    Write-Host "[OK] 服务就绪: $($health.data.students) 学员, $($health.data.leads) 意向" -ForegroundColor Green
    if ($publicUrl) {
        try {
            $pub = Invoke-WebRequest -Uri "$publicUrl/api/health" -TimeoutSec 8 -UseBasicParsing
            Write-Host "[OK] 公网验证通过: $publicUrl (HTTP $($pub.StatusCode))" -ForegroundColor Green
        } catch {
            Write-Host "[WARN] 公网地址待验证（Funnel 可能还在启动）: $publicUrl" -ForegroundColor Yellow
        }
    }
    Write-Host "[OK] 本机访问: http://localhost:3001" -ForegroundColor Cyan
    if ($publicUrl) { Write-Host "[OK] 固定公网地址: $publicUrl" -ForegroundColor Green }
} catch {
    Write-Host "[WARN] 服务可能尚未就绪，稍后访问 http://localhost:3001" -ForegroundColor Yellow
}
Write-Host "[OK] 日志路径: $LogsDir" -ForegroundColor Gray

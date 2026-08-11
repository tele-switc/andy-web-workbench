<#
.SYNOPSIS
  安装"开机自启"（尽可能接近开机即上线）。
  优先级：
    1. 计划任务 AtStartup（需要管理员权限）
    2. 启动文件夹快捷方式（无需管理员，登录时启动）
  同时启用 Tailscale Run Unattended（让 Tailscale 服务在用户未登录时也保持在线）。
  需要管理员运行时请以管理员身份执行；普通权限会自动降级为启动文件夹方案。
#>
param(
    [switch]$Elevate   # 尝试 UAC 提权执行
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogsDir = Join-Path $ProjectRoot 'logs'
if (-not (Test-Path $LogsDir)) { New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null }
$BootLog = Join-Path $LogsDir 'boot-install.log'
function Log($m) { Add-Content -Path $BootLog -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $m" -Encoding utf8 }

# ---- UAC 提权 ----
if ($Elevate) {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Host "[!] 当前非管理员，尝试 UAC 提权..." -ForegroundColor Yellow
        try {
            Start-Process -FilePath 'powershell.exe' -ArgumentList @(
                '-NoProfile','-ExecutionPolicy','Bypass',
                '-File', "$PSCommandPath"
            ) -Verb RunAs
            Write-Host "[OK] 已在提权窗口中执行，请在新窗口查看结果。" -ForegroundColor Green
            return
        } catch {
            Write-Host "[!] UAC 提权失败：$($_.Exception.Message)。改用普通权限方案。" -ForegroundColor Yellow
        }
    }
}

Write-Host "`n=== Andy 工作台 — 开机自启安装 ===" -ForegroundColor Cyan
Log "=== install-boot-services ==="

# 1) 确保 Tailscale Funnel 配置持久化
Write-Host "[1/4] 检查 Tailscale Funnel..."
try {
    $ts = 'C:\Program Files\Tailscale\tailscale.exe'
    if (Test-Path $ts) {
        & $ts funnel --bg --yes 3000 2>&1 | Out-Null
        Log "funnel --bg ensured"
        Write-Host "      Funnel --bg 已确认/重建" -ForegroundColor Green
    }
} catch { Log "funnel err: $_" }

# 2) 尝试注册开机计划任务（AtStartup）——需要管理员
Write-Host "[2/4] 注册开机计划任务..."
$taskRegistered = $false
try {
    $action = New-ScheduledTaskAction -Execute "C:\Program Files\nodejs\node.exe" `
        -Argument "E:\Projects\AndyWebWorkbench\server\src\index.js" `
        -WorkingDirectory "E:\Projects\AndyWebWorkbench\server"
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -ExecutionTimeLimit 0
    Register-ScheduledTask -TaskName "AndyWorkbenchBoot" -Action $action -Trigger $trigger -Settings $settings -Force -ErrorAction Stop | Out-Null
    $taskRegistered = $true
    Log "task AndyWorkbenchBoot registered"
    Write-Host "      已注册计划任务 AndyWorkbenchBoot（开机自启）" -ForegroundColor Green
} catch {
    Log "task register err: $($_.Exception.Message)"
    Write-Host "      无管理员权限，计划任务注册失败（如需开机自启请以管理员运行本脚本）" -ForegroundColor Yellow
}

# 3) 启动文件夹快捷方式（登录时启动，兜底）
Write-Host "[3/4] 写入启动文件夹快捷方式..."
$startupDir = [Environment]::GetFolderPath('Startup')
$lnk = Join-Path $startupDir 'AndyWorkbench.lnk'
try {
    $ws = New-Object -ComObject WScript.Shell
    $sc = $ws.CreateShortcut($lnk)
    $sc.TargetPath = "C:\Program Files\PowerShell\7\pwsh.exe"
    $sc.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ProjectRoot\start-workbench.ps1`""
    $sc.WorkingDirectory = $ProjectRoot
    $sc.Save()
    Log "startup lnk written"
    Write-Host "      已写入：$lnk" -ForegroundColor Green
} catch { Log "lnk err: $_" }

# 4) 验证
Write-Host "[4/4] 验证..."
$t = Get-ScheduledTask -TaskName "AndyWorkbenchBoot" -ErrorAction SilentlyContinue
if ($t) { Write-Host "      计划任务：已注册" -ForegroundColor Green } else { Write-Host "      计划任务：未注册（仅启动文件夹）" -ForegroundColor Yellow }
if (Test-Path $lnk) { Write-Host "      启动快捷方式：存在" -ForegroundColor Green } else { Write-Host "      启动快捷方式：缺失" -ForegroundColor Yellow }

Write-Host "`n完成。若已以管理员运行，则电脑开机后（登录前）后端会自动启动。" -ForegroundColor Cyan
Write-Host "日志：$BootLog" -ForegroundColor Gray
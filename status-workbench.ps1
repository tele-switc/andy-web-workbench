<#
.SYNOPSIS
  Andy 工作台 — 查看运行状态
.DESCRIPTION
  检查后端、隧道、数据库、autostart 任务状态
#>
$ErrorActionPreference = "SilentlyContinue"

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        Andy 工作台 — 运行状态检查        ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 1. 后端服务
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 5
    Write-Host "  [后端]  ✅ 运行中" -ForegroundColor Green
    $d = $health.data
    Write-Host "         ├─ 学员: $($d.students)"
    Write-Host "         ├─ 意向: $($d.leads)"
    Write-Host "         ├─ 回访: $($d.records)"
    Write-Host "         └─ 在线设备: $($d.connectedClients)"
} catch {
    Write-Host "  [后端]  ❌ 未运行" -ForegroundColor Red
}

# 2. 数据库
$dbPath = "E:\Projects\AndyWebWorkbench\server\data\workbench.db"
if (Test-Path $dbPath) {
    $size = (Get-Item $dbPath).Length
    $lastWrite = (Get-Item $dbPath).LastWriteTime
    Write-Host "  [数据]  ✅ SQLite 存在 ($([math]::Round($size/1KB,1)) KB, 最后写入 $lastWrite)" -ForegroundColor Green
} else {
    Write-Host "  [数据]  ⚠️ 数据库文件不存在" -ForegroundColor Yellow
}

# 3. 隧道
$cf = Get-Process cloudflared -ErrorAction SilentlyContinue
if ($cf) {
    Write-Host "  [隧道]  ✅ cloudflared 运行中" -ForegroundColor Green
    $tunnelLog = "E:\Projects\AndyWebWorkbench\logs\tunnel.log"
    if (Test-Path $tunnelLog) {
        $url = Select-String -Path $tunnelLog -Pattern "https://[\w-]+\.trycloudflare\.com" | Select-Object -Last 1
        if ($url) {
            Write-Host "          └─ 公网地址: $($url.Matches[0].Value)" -ForegroundColor Green
        }
    }
} else {
    Write-Host "  [隧道]  ⚠️ cloudflared 未运行" -ForegroundColor Yellow
}

# 4. 自启动任务
$task = Get-ScheduledTask -TaskName "AndyWorkbench" -ErrorAction SilentlyContinue
if ($task) {
    Write-Host "  [自启]  ✅ 已注册 (开机自启动)" -ForegroundColor Green
} else {
    Write-Host "  [自启]  ⚠️ 未注册" -ForegroundColor Yellow
}

# 5. 日志
$logFiles = Get-ChildItem "E:\Projects\AndyWebWorkbench\logs" -ErrorAction SilentlyContinue
if ($logFiles) {
    Write-Host "  [日志]  ✅ 共 $($logFiles.Count) 个日志文件" -ForegroundColor Green
    $logFiles | ForEach-Object { Write-Host "          └─ $($_.Name) ($([math]::Round($_.Length/1KB,1)) KB)" }
} else {
    Write-Host "  [日志]  ⚠️ 无日志文件" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "本机访问: http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
<#
.SYNOPSIS
  Andy 工作台 — Tailscale Funnel 一键安装与配置（需管理员权限）
  由 start-workbench.ps1 / 用户手动以管理员运行。
  流程: 安装 Tailscale → 登录(浏览器) → 启用 Funnel 暴露 localhost:3000
        → 把固定公网地址写入 logs/public-url.txt
#>
param(
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogsDir = Join-Path $ProjectRoot 'logs'
if (-not (Test-Path $LogsDir)) { New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null }
$UrlFile = Join-Path $LogsDir 'public-url.txt'
$StatusFile = Join-Path $LogsDir 'tailscale-status.json'

$TsExe = 'C:\Program Files\Tailscale\tailscale.exe'
$TsdExe = 'C:\Program Files\Tailscale\tailscaled.exe'

if ($Uninstall) {
    Write-Host "[1/1] 卸载 Tailscale..."
    $msi = Get-ChildItem "$env:TEMP\tailscale-setup-*.msi" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($msi) {
        Start-Process msiexec.exe -ArgumentList '/x', $msi.FullName, '/qn', '/norestart' -Wait
    }
    return
}

# ---- 1. 安装（仅当尚未安装） ----
if (-not (Test-Path $TsExe)) {
    Write-Host "[1/4] 未检测到 Tailscale，开始下载安装..."
    $Version = '1.102.2'
    $MsiUrl = "https://pkgs.tailscale.com/stable/tailscale-setup-$Version-amd64.msi"
    $MsiPath = Join-Path $env:TEMP "tailscale-setup-$Version-amd64.msi"
    if (-not (Test-Path $MsiPath)) {
        Invoke-WebRequest -Uri $MsiUrl -OutFile $MsiPath -UseBasicParsing
    }
    Write-Host "      运行安装程序（静默）..."
    $p = Start-Process msiexec.exe -ArgumentList '/i', $MsiPath, '/qn', '/norestart' -Wait -PassThru
    if ($p.ExitCode -ne 0) {
        Write-Host "[FAIL] 安装失败 (exit $($p.ExitCode))。请以管理员身份重新运行本脚本。" -ForegroundColor Red
        exit 1
    }
    Start-Sleep -Seconds 5
} else {
    Write-Host "[1/4] Tailscale 已安装，跳过安装。"
}

if (-not (Test-Path $TsExe)) {
    Write-Host "[FAIL] 未找到 $TsExe" -ForegroundColor Red
    exit 1
}

# ---- 2. 登录 ----
Write-Host "[2/4] 启动登录..."
$who = & $TsExe status --json 2>$null | ConvertFrom-Json -ErrorAction SilentlyContinue
if ($who -and $who.Self -and $who.Self.Online) {
    Write-Host "      已登录为: $($who.Self.DNSName)"
} else {
    Write-Host "      请在浏览器中完成 Tailscale 登录（免费账号，无需信用卡）。" -ForegroundColor Yellow
    Write-Host "      如果浏览器没有自动打开，请访问: https://login.tailscale.com/start"
    $loginProc = Start-Process $TsExe -ArgumentList 'up' -WindowStyle Normal
    # 等待最多 5 分钟，让用户完成浏览器登录
    $deadline = (Get-Date).AddMinutes(5)
    do {
        Start-Sleep -Seconds 3
        $who = & $TsExe status --json 2>$null | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($who -and $who.Self -and $who.Self.Online) { break }
    } while ((Get-Date) -lt $deadline)
    if (-not ($who -and $who.Self -and $who.Self.Online)) {
        Write-Host "[FAIL] 登录超时。请重新运行脚本完成登录。" -ForegroundColor Red
        exit 1
    }
    Write-Host "      登录成功: $($who.Self.DNSName)"
}

# ---- 3. 启用 Funnel（公开 HTTPS） ----
Write-Host "[3/4] 配置 Funnel 暴露端口 3000 ..."
# Funnel 需要先确保 tailnet 允许（个人免费计划默认支持）。若失败会给出提示。
& $TsExe funnel 3000 2>&1 | ForEach-Object { Write-Host "      $_" }

Start-Sleep -Seconds 2
$fs = & $TsExe funnel status 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "      (如提示需要启用 Funnel，请到 https://login.tailscale.com/admin/settings 打开 Funnel 开关后重试)" -ForegroundColor Yellow
}

# ---- 4. 固定公网地址 ----
Write-Host "[4/4] 解析固定公网地址..."
$who = & $TsExe status --json 2>$null | ConvertFrom-Json -ErrorAction SilentlyContinue
$dnsName = $who.Self.DNSName
if ($dnsName) {
    $publicUrl = "https://$($dnsName.TrimEnd('.'))"
    Set-Content -Path $UrlFile -Value $publicUrl -Encoding ascii
    $status = @{
        url = $publicUrl
        dns = $dnsName
        configuredAt = (Get-Date).ToUniversalTime().ToString('o')
        funnel = $true
    } | ConvertTo-Json
    Set-Content -Path $StatusFile -Value $status -Encoding utf8
    Write-Host "[OK] 固定公网地址: $publicUrl" -ForegroundColor Green
    Write-Host "[OK] 手机/浏览器直接访问该地址即可（无需安装任何东西、无需 VPN）。" -ForegroundColor Green
} else {
    Write-Host "[FAIL] 无法解析 Tailscale 地址" -ForegroundColor Red
    exit 1
}

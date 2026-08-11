<#
.SYNOPSIS
  Funnel + Tailscale 看门狗 — 保证 Tailscale 在线且 Funnel 持续对外服务
  由 start-workbench.ps1 启动。每 20 秒检查：
    1. Tailscale 是否已登录且在线（NoState/离线则尝试重连、重认证）
    2. Funnel 是否已配置到 localhost:3000（缺失则 --bg 重建）
    3. 后端 health 是否正常（异常交给 server-watchdog 恢复，这里只记录）
  网络断开/休眠唤醒/Wi-Fi切换后，本循环会自动重连与恢复。
  稳定公网地址写入 logs/public-url.txt。
#>
$ErrorActionPreference = 'SilentlyContinue'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogsDir = Join-Path $ProjectRoot 'logs'
if (-not (Test-Path $LogsDir)) { New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null }
$LogFile = Join-Path $LogsDir 'funnel.log'
$UrlFile = Join-Path $LogsDir 'public-url.txt'
$StatusFile = Join-Path $LogsDir 'tailscale-status.json'
$TsExe = 'C:\Program Files\Tailscale\tailscale.exe'
$HealthUrl = 'http://localhost:3000/api/health'
$SetupScript = Join-Path $ProjectRoot 'scripts\tailscale-setup.ps1'

function Write-Log($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Add-Content -Path $LogFile -Value $line -Encoding utf8
}

function Get-TsState {
    try {
        $j = & $TsExe status --json 2>$null | ConvertFrom-Json
        return $j
    } catch { return $null }
}

function Get-PublicUrl {
    $j = Get-TsState
    if ($j -and $j.Self -and $j.Self.DNSName) {
        return "https://$($j.Self.DNSName.TrimEnd('.'))"
    }
    return $null
}

function Ensure-Tailscale {
    $j = Get-TsState
    if ($j -and $j.Self -and $j.Self.Online) { return $true }
    # 未登录或 NoState：尝试重连 / 重认证（浏览器已登录过则自动通过）
    Write-Log 'Tailscale 未在线，尝试重连...'
    $out = (& $TsExe up --reset --timeout=40s 2>&1 | Out-String)
    Start-Sleep -Seconds 5
    $j2 = Get-TsState
    if ($j2 -and $j2.Self -and $j2.Self.Online) {
        Write-Log 'Tailscale 已恢复在线'
        return $true
    }
    Write-Log "[WARN] Tailscale 仍离线（可能控制平面被网络屏蔽）。$($out.Trim())"
    return $false
}

function Ensure-Funnel {
    if (-not (Ensure-Tailscale)) { return $false }
    $fs = (& $TsExe funnel status 2>&1 | Out-String)
    if ($fs -match 'Funnel on') { return $true }
    Write-Log 'Funnel 未配置，正在启用...'
    $out = (& $TsExe funnel --bg --yes 3000 2>&1 | Out-String)
    Start-Sleep -Seconds 3
    $fs2 = (& $TsExe funnel status 2>&1 | Out-String)
    if ($fs2 -match 'Funnel on') {
        Write-Log 'Funnel 已启用 ✓'
        return $true
    }
    Write-Log "[FAIL] Funnel 启用失败：$($out.Trim())"
    return $false
}

Write-Log 'Funnel watchdog 启动'

while ($true) {
    try {
        # 更新稳定公网地址
        $url = Get-PublicUrl
        if ($url) {
            Set-Content -Path $UrlFile -Value $url -Encoding ascii
            try {
                $st = @{ url = $url; checkedAt = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json
                Set-Content -Path $StatusFile -Value $st -Encoding utf8
            } catch {}
        }

        # 后端健康
        $serverOk = $false
        try {
            $h = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 5
            if ($h.data.status -eq 'ok') { $serverOk = $true }
        } catch {}

        # Tailscale + Funnel 保活
        $ok = Ensure-Funnel

        if ($ok -and $serverOk -and $url) { Write-Log "OK 公网=$url 后端=正常" }
        elseif ($ok -and -not $serverOk) { Write-Log 'OK Funnel=正常 后端=未就绪(等待 server-watchdog)' }
        elseif (-not $ok) { Write-Log 'WARN Tailscale/Funnel=异常' }
    } catch {
        Write-Log "ERROR $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 20
}
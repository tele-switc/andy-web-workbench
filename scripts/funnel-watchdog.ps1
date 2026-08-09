<#
.SYNOPSIS
  Funnel 看门狗 — 保证 Tailscale Funnel 持续对外提供服务（Tailscale 方案，替代原 cloudflared）
  由 start-workbench.ps1 启动。每 30 秒检查一次：
    1. Tailscale 是否在线（未登录/未启动则提示）
    2. Funnel 是否已配置到 localhost:3000（缺失则重新配置 --bg）
    3. 后端 health 是否正常（异常交给 server-watchdog 恢复，这里只记录）
  同时把稳定公网地址写入 logs/public-url.txt，供前后端读取。
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

function Write-Log($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Add-Content -Path $LogFile -Value $line -Encoding utf8
}

function Get-PublicUrl {
    try {
        $j = & $TsExe status --json 2>$null | ConvertFrom-Json
        if ($j.Self.DNSName) {
            $url = "https://$($j.Self.DNSName.TrimEnd('.'))"
            return $url
        }
    } catch {}
    return $null
}

function Ensure-Funnel {
    # 1) 确认在线
    try {
        $j = & $TsExe status --json 2>$null | ConvertFrom-Json
        if (-not $j.Self.Online) {
            Write-Log '[WARN] Tailscale 未在线（可能是未登录）。请运行 scripts/tailscale-setup.ps1 完成登录。'
            return $false
        }
    } catch {
        Write-Log '[WARN] tailscale 命令不可用，请确认已安装 Tailscale。'
        return $false
    }

    # 2) 确认 Funnel 已配置
    $fs = (& $TsExe funnel status 2>&1 | Out-String)
    if ($fs -match 'Funnel on') {
        return $true
    }
    Write-Log 'Funnel 未配置，正在启用...'
    $out = (& $TsExe funnel --bg --yes 3000 2>&1 | Out-String)
    Start-Sleep -Seconds 2
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

        # Funnel 保活
        $ok = Ensure-Funnel

        if ($ok -and $serverOk -and $url) {
            Write-Log "OK 公网=$url 后端=正常"
        } elseif ($ok -and -not $serverOk) {
            Write-Log 'OK Funnel=正常 后端=未就绪(等待 server-watchdog 恢复)'
        } elseif (-not $ok) {
            Write-Log 'WARN Funnel=异常'
        }
    } catch {
        Write-Log "ERROR $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 30
}

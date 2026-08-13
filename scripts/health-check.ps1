<#
.SYNOPSIS
  Andy 工作台 — 健康巡检 + 自动修复
  每 5 分钟检查一次：
    1. Node 后端 (localhost:3001 /api/health)
    2. Tailscale 是否在线
    3. Funnel 是否配置
    4. server-watchdog / funnel-watchdog 是否存活
  发现问题自动修复；安全规范：只管理本项目自己的进程，
  不批量杀进程、不误伤其他项目，先识别验证再操作。

  用法：
    powershell -File scripts\health-check.ps1           # 循环模式(每5分钟一次)
    powershell -File scripts\health-check.ps1 -Once     # 只跑一次
#>
param([switch]$Once)

$ErrorActionPreference = 'SilentlyContinue'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogsDir = Join-Path $ProjectRoot 'logs'
if (-not (Test-Path $LogsDir)) { New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null }
$LogFile = Join-Path $LogsDir 'health-check.log'
$StateFile = Join-Path $LogsDir 'watchdog-pids.json'   # 记录本项目看门狗 PID（仅用于避免重复，使用前会再次验证）
$Pwsh = 'C:\Program Files\PowerShell\7\pwsh.exe'
$HealthUrl = 'http://127.0.0.1:3001/api/health'
$TsExe = 'C:\Program Files\Tailscale\tailscale.exe'
$ServerWatchdog = Join-Path $ProjectRoot 'scripts\server-watchdog.ps1'
$FunnelWatchdog = Join-Path $ProjectRoot 'scripts\funnel-watchdog.ps1'

function Log($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Add-Content -Path $LogFile -Value $line -Encoding utf8
}

# ---------- 工具：识别进程是否属于本项目 ----------
function IsProjectPwsh($cmdline) {
    # 只看本项目脚本路径，绝不按进程名批量操作
    return ($cmdline -match [regex]::Escape('server-watchdog.ps1')) -or
           ($cmdline -match [regex]::Escape('funnel-watchdog.ps1')) -or
           ($cmdline -match [regex]::Escape('health-check.ps1')) -or
           ($cmdline -match [regex]::Escape('tailscale-setup.ps1'))
}

function Get-ProjectPwshProcs($which) {
    # $which: 'server-watchdog' / 'funnel-watchdog'
    # 精确匹配：进程命令行以 -File xxx\<which>.ps1 结尾（排除 health-check 本身误匹配）
    $kw = [regex]::Escape($which + '.ps1')
    return Get-CimInstance Win32_Process -Filter "Name='pwsh.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            ($_.CommandLine -match $kw) -and
            ($_.CommandLine -notmatch 'health-check\.ps1') -and
            ($_.ProcessId -ne $PID)
        }
}

# 去重：保留最新实例，终止多余的旧实例（仅本项目脚本，精确路径验证过）
function Dedupe-Watchdogs($which) {
    $procs = @(Get-ProjectPwshProcs $which)
    if ($procs.Count -le 1) { return 0 }
    # 按创建时间升序排，保留最后一个（最新）
    $sorted = $procs | Sort-Object CreationDate
    $keep = $sorted[-1]
    $kill = $sorted | Where-Object { $_.ProcessId -ne $keep.ProcessId }
    foreach ($p in $kill) {
        # 再次确认属于本项目（防 PID 复用误伤）
        $cur = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $p.ProcessId) -ErrorAction SilentlyContinue
        if ($cur -and $cur.CommandLine -match [regex]::Escape($which + '.ps1')) {
            Stop-Process -Id $p.ProcessId -Force
            Log "FIX 终止重复 $which (PID $($p.ProcessId))，保留最新 (PID $($keep.ProcessId))"
        } else {
            Log "SKIP 进程 PID $($p.ProcessId) 已不存在或非本项目，不操作"
        }
    }
    return $kill.Count
}

# ---------- 1. 后端健康 ----------
function Test-BackendHealth {
    try {
        $h = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 6
        if ($h.data.status -eq 'ok') { return $true }
    } catch {}
    return $false
}

function Start-OurWatchdog($watchdogScript) {
    # 只启动不杀进程；若同脚本已在运行则跳过
    $name = [IO.Path]::GetFileNameWithoutExtension($watchdogScript)
    $existing = Get-ProjectPwshProcs $name
    if ($existing) {
        Log "WARN $name 已在运行 (PID $($existing.ProcessId -join ','))，跳过启动"
        return $false
    }
    try {
        Start-Process -FilePath $Pwsh -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File', "`"$watchdogScript`"") -WindowStyle Hidden
        Log "FIX 启动 $name"
        return $true
    } catch {
        Log "ERR 启动 $name 失败: $($_.Exception.Message)"
        return $false
    }
}

# ---------- 2/3. Tailscale + Funnel ----------
function Test-Tailscale {
    try {
        $j = & $TsExe status --json 2>$null | ConvertFrom-Json
        return ($j.Self -and $j.Self.Online)
    } catch { return $false }
}

# 修复 tailscaled 卡 NoState：确保 tailscale-ipn (GUI) 进程在运行
function Ensure-TailscaleIpn {
    if (-not (Get-Process tailscale-ipn -ErrorAction SilentlyContinue)) {
        $ipn = 'C:\Program Files\Tailscale\tailscale-ipn.exe'
        if (Test-Path $ipn) {
            Start-Process $ipn
            Log "FIX 启动 tailscale-ipn (GUI) 以解锁 tailscaled"
            Start-Sleep -Seconds 8
        }
    }
}

function Test-Funnel {
    $fs = (& $TsExe funnel status 2>&1 | Out-String)
    return ($fs -match 'Funnel on')
}

# ---------- 单次巡检 ----------
function Run-Check {
    $fixed = @()

    # --- 看门狗去重（防多实例抢端口） ---
    Dedupe-Watchdogs 'server-watchdog' | Out-Null
    Dedupe-Watchdogs 'funnel-watchdog' | Out-Null

    # --- server-watchdog 保活 ---
    $wd = Get-ProjectPwshProcs 'server-watchdog'
    if (-not $wd) {
        if (Start-OurWatchdog $ServerWatchdog) { $fixed += 'server-watchdog' }
    } else {
        Log "OK  server-watchdog 存活 (PID $($wd.ProcessId -join ','))"
    }

    # --- 后端 ---
    if (Test-BackendHealth) {
        Log "OK  后端正常"
    } else {
        Log "WARN 后端不可达"
        # 后端挂了：若 server-watchdog 活着则交给它恢复；否则启动它
        if (-not $wd) {
            if (Start-OurWatchdog $ServerWatchdog) { $fixed += 'backend' }
        }
    }

    # --- Tailscale + Funnel ---
    if (-not (Test-Tailscale)) {
        Log "WARN Tailscale 未在线"
        Ensure-TailscaleIpn   # 修复 tailscaled 卡 NoState（GUI 进程缺失）
        try {
            & $TsExe up --reset --timeout=40s 2>&1 | Out-Null
            Log "FIX 尝试重连 Tailscale (up --reset)"
            $fixed += 'tailscale'
        } catch {}
        Start-Sleep -Seconds 4
    } else {
        Log "OK  Tailscale 在线"
    }

    if (-not (Test-Funnel)) {
        Log "WARN Funnel 未配置"
        try {
            & $TsExe funnel --bg --yes 3001 2>&1 | Out-Null
            Log "FIX 重建 Funnel (--bg 3001)"
            $fixed += 'funnel'
        } catch {}
    } else {
        Log "OK  Funnel 正常"
    }

    # --- funnel-watchdog 保活 ---
    $fw = Get-ProjectPwshProcs 'funnel-watchdog'
    if (-not $fw) {
        if (Start-OurWatchdog $FunnelWatchdog) { $fixed += 'funnel-watchdog' }
    } else {
        Log "OK  funnel-watchdog 存活 (PID $($fw.ProcessId -join ','))"
    }

    if ($fixed.Count -gt 0) {
        Log "RESULT 本轮修复: $($fixed -join ', ')"
    } else {
        Log "RESULT 全部正常"
    }
}

# ---------- 入口 ----------
Log "==== health-check 开始 (模式: $(if($Once){'once'}else{'loop'})) ===="
if ($Once) {
    Run-Check
} else {
    while ($true) {
        Run-Check
        Start-Sleep -Seconds 300   # 每 5 分钟
    }
}

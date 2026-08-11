<#
.SYNOPSIS
  Tailscale + Clash/Mihomo 兼容修复
  解决：Clash fake-ip 劫持 Tailscale 域名 + TUN 抢占 Tailscale 路由
        + tailscale-ipn GUI 进程未启动导致 tailscaled 卡 NoState
  安全：只修改 Tailscale 相关域名/IP 的规则，不破坏其他代理规则。
        修改前自动备份配置。可重复运行（幂等）。
#>
param([switch]$SkipClashConfig)

$ErrorActionPreference = 'Stop'
$LogFile = "E:\Projects\AndyWebWorkbench\logs\tailscale-fix.log"
function Log($m) { Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $m" -Encoding utf8 }

$cfg = "C:\Users\tele2\AppData\Roaming\io.github.clash-verge-rev.clash-verge-rev\clash-verge.yaml"
$ts = "C:\Program Files\Tailscale\tailscale.exe"

Log "=== tailscale-fix 开始 ==="

# ---------- 1) Clash 配置：fake-ip-filter + DIRECT + IP-CIDR + route-exclude ----------
if (-not $SkipClashConfig) {
    $changed = $false
    $raw = Get-Content $cfg -Raw -ErrorAction SilentlyContinue
    if (-not $raw) { Log "ERR 找不到 Clash 配置: $cfg"; exit 1 }

    # 备份（每次只备一份最新的）
    $bak = "$cfg.bak-tailscale"
    if (-not (Test-Path $bak)) { Copy-Item $cfg $bak; Log "备份到 $bak" }

    # 1a) fake-ip-filter 加 Tailscale 域名
    if ($raw -notmatch "\+'\.tailscale\.com'") {
        $raw = $raw -replace "  - 'www\.msftconnecttest\.com'\r?\n", "  - 'www.msftconnecttest.com'`n  - '+.tailscale.com'`n  - '+.ts.net'`n"
        $changed = $true
        Log "加入 fake-ip-filter: +.tailscale.com, +.ts.net"
    }
    # 1b) rules 开头加 DIRECT
    if ($raw -notmatch "DOMAIN-SUFFIX,tailscale\.com,DIRECT") {
        $raw = $raw -replace "^(rules:\r?\n)", "`$1- IP-CIDR,100.64.0.0/10,DIRECT,no-resolve`n- IP-CIDR,3.121.44.151/32,DIRECT,no-resolve`n- IP-CIDR,103.84.155.0/24,DIRECT,no-resolve`n- IP-CIDR,192.200.0.0/16,DIRECT,no-resolve`n- DOMAIN-SUFFIX,tailscale.com,DIRECT`n- DOMAIN-SUFFIX,ts.net,DIRECT`n"
        $changed = $true
        Log "加入 rules: tailscale.com/ts.net DIRECT + IP-CIDR"
    }
    # 1c) tun.route-exclude-address
    if ($raw -notmatch "route-exclude-address") {
        $raw = $raw -replace "(\r?\n  dns-hijack:)", "`n  route-exclude-address:`n  - 100.64.0.0/10`n  - 3.121.44.151/32`n  - 103.84.155.0/24`n  - 192.200.0.0/16`n  - 10.0.0.0/8`n`$1"
        $changed = $true
        Log "加入 tun.route-exclude-address"
    }

    if ($changed) {
        Set-Content -Path $cfg -Value $raw -Encoding utf8 -NoNewline
        Log "配置已更新"
    } else { Log "Clash 配置已是最新（幂等）" }

    # 重载 mihomo 内核（通过命名管道，优雅重启）
    Log "重载 mihomo 内核..."
    $script = @"
`$ErrorActionPreference='Stop'
`$pipe='verge-mihomo'
`$client = New-Object System.IO.Pipes.NamedPipeClientStream('.', `$pipe, [System.IO.Pipes.PipeDirection]::InOut, [System.IO.Pipes.PipeOptions]::None)
`$client.Connect(3000)
`$writer = New-Object System.IO.StreamWriter(`$client); `$writer.AutoFlush=`$true
`$reader = New-Object System.IO.StreamReader(`$client)
`$writer.Write("POST /restart HTTP/1.1`r`nHost: localhost`r`nContent-Length: 0`r`nConnection: close`r`n`r`n")
`$resp = `$reader.ReadToEnd()
`$client.Dispose()
"@
    & powershell -NoProfile -ExecutionPolicy Bypass -Command $script | Out-Null
    Start-Sleep -Seconds 10
    Log "mihomo 已重启"
}

# ---------- 2) 启动 tailscale-ipn (GUI) ----------
$ipn = "C:\Program Files\Tailscale\tailscale-ipn.exe"
if (-not (Get-Process tailscale-ipn -ErrorAction SilentlyContinue)) {
    if (Test-Path $ipn) {
        Start-Process $ipn
        Log "已启动 tailscale-ipn"
        Start-Sleep -Seconds 15
    }
} else { Log "tailscale-ipn 已在运行" }

# ---------- 3) 验证 ----------
Start-Sleep -Seconds 5
$j = & $ts status --json 2>&1 | ConvertFrom-Json
$online = $j.Self -and $j.Self.Online
Log "Tailscale: Backend=$($j.BackendState) Online=$online DNS=$($j.Self.DNSName)"

if ($online) {
    # 重建 Funnel
    & $ts funnel --bg --yes 3000 2>&1 | Out-Null
    Start-Sleep -Seconds 4
    $fs = & $ts funnel status 2>&1 | Out-String
    $funnelOn = $fs -match 'Funnel on'
    Log "Funnel: $funnelOn"
    if ($funnelOn) {
        $pub = Get-Content "E:\Projects\AndyWebWorkbench\logs\public-url.txt" -ErrorAction SilentlyContinue
        if (-not $pub) { $pub = "https://$($j.Self.DNSName.TrimEnd('.'))"; Set-Content "E:\Projects\AndyWebWorkbench\logs\public-url.txt" $pub -Encoding ascii }
        Log "公网地址: $pub"
        # 验证公网
        curl.exe -s -o NUL -w "public health: HTTP %{http_code} (%{time_total}s)`n" "$pub/api/health" --connect-timeout 10 --max-time 20 | ForEach-Object { Log $_; Write-Host $_ }
    }
} else {
    Log "WARN Tailscale 仍未在线"
    Write-Host "Tailscale 未在线。请检查: 1) Clash 配置 2) tailscale-ipn 3) 网络" -ForegroundColor Yellow
}

Log "=== 完成 ==="
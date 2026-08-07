<#
.SYNOPSIS
  Andy 工作台 — Cloudflare Tunnel 设置脚本
  用于将本地服务暴露到公网，手机从外网也能访问
.DESCRIPTION
  使用 Cloudflare Tunnel (cloudflared) 创建安全隧道
  前提：需要先安装 cloudflared
  安装方法: winget install cloudflare.cloudflared
  或手动下载: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
#>

$ErrorActionPreference = "Stop"
$PORT = 3000

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Andy 工作台 — Cloudflare Tunnel 设置   ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check if cloudflared is installed
$cloudflared = Get-Command "cloudflared" -ErrorAction SilentlyContinue
if (-not $cloudflared) {
    Write-Host "❌ 未找到 cloudflared，请先安装:" -ForegroundColor Red
    Write-Host "   方法1: winget install cloudflare.cloudflared" -ForegroundColor Yellow
    Write-Host "   方法2: 手动下载 https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "或者使用局域网访问（同一 WiFi 下）:" -ForegroundColor Yellow
    $ips = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback|Virtual|Bluetooth" -and $_.PrefixOrigin -eq "Dhcp" })
    foreach ($ip in $ips) {
        $localIp = $ip.IPAddress
        if ($localIp -and $localIp -notlike "127.*" -and $localIp -notlike "169.*") {
            Write-Host "   http://$localIp`:$PORT" -ForegroundColor Green
        }
    }
    exit 1
}

Write-Host "✅ cloudflared 已安装" -ForegroundColor Green
Write-Host ""
Write-Host "启动 Tunnel 中..." -ForegroundColor Yellow
Write-Host ""

# Start the tunnel
try {
    & $cloudflared.Source tunnel --url "http://localhost:$PORT"
} catch {
    Write-Host "❌ Tunnel 启动失败: $_" -ForegroundColor Red
    Write-Host "请确保本地服务已在端口 $PORT 运行: npm run server" -ForegroundColor Yellow
    exit 1
}
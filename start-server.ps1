# QR・NFC ハイブリッドスキャナー ローカルテストサーバー起動スクリプト
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  QR & NFC ハイブリッドスキャナー ローカルテストサーバー" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

$Port = 8080
$CurrentDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# IPアドレスの取得
$IP = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi*", "イーサネット*", "Ethernet*" | Where-Object { $_.IPAddress -notmatch '^169\.' -and $_.IPAddress -notmatch '^127\.' } | Select-Object -First 1).IPAddress

Write-Host "[1] PCのブラウザで確認する場合:" -ForegroundColor Green
Write-Host "    http://localhost:$Port" -ForegroundColor Yellow
Write-Host ""
if ($IP) {
    Write-Host "[2] スマホから同一Wi-Fiで接続する場合:" -ForegroundColor Green
    Write-Host "    http://$($IP):$Port" -ForegroundColor Yellow
    Write-Host ""
}
Write-Host "※Web NFCおよびカメラ機能をスマホで使う場合は、HTTPS、または adb reverse による localhost 接続が必要です。" -ForegroundColor Gray
Write-Host ""

# Python または npx http-server でサーバー起動
if (Get-Command python -ErrorAction SilentlyContinue) {
    Write-Host "PythonのHTTPサーバーを起動します (Port: $Port)..." -ForegroundColor Magenta
    Set-Location $CurrentDir
    python -m http.server $Port
} elseif (Get-Command npx -ErrorAction SilentlyContinue) {
    Write-Host "npx http-server を起動します (Port: $Port)..." -ForegroundColor Magenta
    npx http-server $CurrentDir -p $Port
} else {
    Write-Host "PythonまたはNode.jsが見つかりませんでした。index.htmlを直接開いてご確認ください。" -ForegroundColor Red
    pause
}

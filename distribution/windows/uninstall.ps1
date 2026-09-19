$ErrorActionPreference = "Stop"

$InstallDir = Join-Path $env:LOCALAPPDATA "MillionsNestLive"
$LegacyInstallDir = Join-Path $env:LOCALAPPDATA "MusicScaleLive"
$RunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"

Get-Process MillionsNestLiveNode -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process MusicScaleLiveNode -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Remove-ItemProperty -Path $RunKey -Name "MillionsNestLiveNode" -ErrorAction SilentlyContinue
Remove-ItemProperty -Path $RunKey -Name "MusicScaleLiveNode" -ErrorAction SilentlyContinue

try {
  Start-Process -FilePath "netsh.exe" -ArgumentList "advfirewall firewall delete rule name=`"MillionsNest Live Node`"" -Verb RunAs -Wait
  Start-Process -FilePath "netsh.exe" -ArgumentList "advfirewall firewall delete rule name=`"MusicScale Live Node`"" -Verb RunAs -Wait
} catch {
  Write-Warning "Não foi possível remover automaticamente todas as regras de firewall."
}

Remove-Item $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $LegacyInstallDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "MillionsNest Live Node removido." -ForegroundColor Green

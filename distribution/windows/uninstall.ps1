$ErrorActionPreference = "Stop"

$InstallDir = Join-Path $env:LOCALAPPDATA "MusicScaleLive"
$LegacyInstallDir = Join-Path $env:LOCALAPPDATA "MillionsNestLive"
$RunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"

Get-Process MillionsNestLiveNode -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process MusicScaleLiveNode -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Remove-ItemProperty -Path $RunKey -Name "MillionsNestLiveNode" -ErrorAction SilentlyContinue
Remove-ItemProperty -Path $RunKey -Name "MusicScaleLiveNode" -ErrorAction SilentlyContinue

try {
  Start-Process -FilePath "netsh.exe" -ArgumentList "advfirewall firewall delete rule name=`"MillionsNest Live Node`"" -Verb RunAs -Wait
  Start-Process -FilePath "netsh.exe" -ArgumentList "advfirewall firewall delete rule name=`"MillionsNest Live Node Discovery`"" -Verb RunAs -Wait
  Start-Process -FilePath "netsh.exe" -ArgumentList "advfirewall firewall delete rule name=`"MusicScale Live Node`"" -Verb RunAs -Wait
  Start-Process -FilePath "netsh.exe" -ArgumentList "advfirewall firewall delete rule name=`"MusicScale Live Node Discovery`"" -Verb RunAs -Wait
} catch {
  Write-Warning "Não foi possível remover automaticamente todas as regras de firewall."
}

Remove-Item $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $LegacyInstallDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "MusicScale Live Node removido." -ForegroundColor Green

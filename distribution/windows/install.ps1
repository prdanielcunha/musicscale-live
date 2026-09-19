param(
  [switch]$SkipFirewall
)

$ErrorActionPreference = "Stop"

$SourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstallDir = Join-Path $env:LOCALAPPDATA "MillionsNestLive"
$LegacyInstallDir = Join-Path $env:LOCALAPPDATA "MusicScaleLive"
$ExePath = Join-Path $InstallDir "MillionsNestLiveNode.exe"
$WebDir = Join-Path $InstallDir "web"
$LogDir = Join-Path $InstallDir "logs"
$InstallLog = Join-Path $LogDir "install.log"
$NodeStdout = Join-Path $LogDir "node.stdout.log"
$NodeStderr = Join-Path $LogDir "node.stderr.log"

function Write-InstallLog([string]$Message) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Write-Host $Message
  Add-Content -Path $InstallLog -Value $line -Encoding UTF8
}

try {
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  New-Item -ItemType Directory -Force -Path $WebDir | Out-Null
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  Set-Content -Path $InstallLog -Value "MillionsNest Live Node installer" -Encoding UTF8

  Write-Host ""
  Write-Host "MillionsNest Live Node" -ForegroundColor Cyan
  Write-Host "Instalacao e verificacao automatica" -ForegroundColor DarkGray
  Write-Host ""

  Write-InstallLog "Preparando arquivos..."

  Get-ChildItem -Path $SourceDir -Recurse -File -ErrorAction SilentlyContinue |
    ForEach-Object { Unblock-File -LiteralPath $_.FullName -ErrorAction SilentlyContinue }

  Get-Process MillionsNestLiveNode -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
  Get-Process MusicScaleLiveNode -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue

  $SourceExe = Join-Path $SourceDir "MillionsNestLiveNode.exe"
  $SourceWeb = Join-Path $SourceDir "web"

  if (-not (Test-Path $SourceExe)) {
    throw "MillionsNestLiveNode.exe nao foi encontrado. Extraia o ZIP completo antes de instalar."
  }
  if (-not (Test-Path (Join-Path $SourceWeb "index.html"))) {
    throw "A pasta web nao foi encontrada. Extraia o ZIP completo antes de instalar."
  }

  Copy-Item $SourceExe $ExePath -Force
  Remove-Item (Join-Path $WebDir "*") -Recurse -Force -ErrorAction SilentlyContinue
  Copy-Item (Join-Path $SourceWeb "*") $WebDir -Recurse -Force

  $RunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
  New-Item -Path $RunKey -Force | Out-Null
  Remove-ItemProperty -Path $RunKey -Name "MusicScaleLiveNode" -ErrorAction SilentlyContinue
  $RunValue = '"' + $ExePath + '"'
  Set-ItemProperty -Path $RunKey -Name "MillionsNestLiveNode" -Value $RunValue

  if (-not $SkipFirewall) {
    Write-InstallLog "Configurando acesso pela rede local..."
    $FirewallScript = @"
netsh advfirewall firewall delete rule name="MusicScale Live Node" >NUL 2>&1
netsh advfirewall firewall delete rule name="MillionsNest Live Node" >NUL 2>&1
netsh advfirewall firewall add rule name="MillionsNest Live Node" dir=in action=allow protocol=TCP localport=4317 profile=private
"@
    $TempFirewall = Join-Path $env:TEMP "millionsnest-live-firewall.cmd"
    Set-Content -Path $TempFirewall -Value $FirewallScript -Encoding ASCII

    try {
      $FirewallArgs = '/c "' + $TempFirewall + '"'
      $proc = Start-Process -FilePath "cmd.exe" -ArgumentList $FirewallArgs -Verb RunAs -Wait -PassThru
      if ($proc.ExitCode -ne 0) {
        Write-Warning "A regra de firewall nao foi criada automaticamente."
        Write-InstallLog "Aviso: firewall retornou codigo $($proc.ExitCode)."
      }
    } catch {
      Write-Warning "Permissao de firewall nao concedida. O Node sera testado localmente mesmo assim."
      Write-InstallLog "Aviso: regra de firewall nao criada: $($_.Exception.Message)"
    } finally {
      Remove-Item $TempFirewall -ErrorAction SilentlyContinue
    }
  }

  if ((Test-Path $LegacyInstallDir) -and ($LegacyInstallDir -ne $InstallDir)) {
    Remove-Item $LegacyInstallDir -Recurse -Force -ErrorAction SilentlyContinue
  }

  Remove-Item $NodeStdout, $NodeStderr -Force -ErrorAction SilentlyContinue

  Write-InstallLog "Iniciando o Live Node..."
  $startArgs = @{
    FilePath = $ExePath
    WorkingDirectory = $InstallDir
    RedirectStandardOutput = $NodeStdout
    RedirectStandardError = $NodeStderr
    PassThru = $true
  }
  $node = Start-Process @startArgs

  $healthy = $false
  for ($attempt = 1; $attempt -le 12; $attempt++) {
    Start-Sleep -Milliseconds 500
    if ($node.HasExited) {
      $stderr = if (Test-Path $NodeStderr) { (Get-Content $NodeStderr -Raw -ErrorAction SilentlyContinue) } else { "" }
      throw "O Live Node encerrou ao iniciar. $stderr"
    }

    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:4317/health" -TimeoutSec 2
      if ($response.StatusCode -eq 200) {
        $healthy = $true
        break
      }
    } catch {
    }
  }

  if (-not $healthy) {
    throw "O Live Node iniciou, mas nao respondeu em http://127.0.0.1:4317/health."
  }

  Write-InstallLog "Live Node online e respondendo na porta 4317."
  Start-Process "http://127.0.0.1:4317/node"

  Write-Host ""
  Write-Host "INSTALACAO CONCLUIDA" -ForegroundColor Green
  Write-Host "O painel local foi aberto no navegador."
  Write-Host "O Live Node iniciara automaticamente ao entrar no Windows."
  Write-Host ""
  Write-Host "Log: $InstallLog" -ForegroundColor DarkGray
  exit 0
}
catch {
  try {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    Add-Content -Path $InstallLog -Value "ERRO: $($_.Exception.Message)" -Encoding UTF8
  } catch {
  }

  Write-Host ""
  Write-Host "A INSTALACAO NAO FOI CONCLUIDA" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Log: $InstallLog" -ForegroundColor DarkGray
  Write-Host "Tire uma foto desta tela ou envie o arquivo de log para diagnostico."
  exit 1
}

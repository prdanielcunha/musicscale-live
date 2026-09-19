@echo off
setlocal
title MillionsNest Live - Instalador

echo.
echo ==========================================
echo        MILLIONSNEST LIVE NODE
echo ==========================================
echo.
echo O instalador vai configurar o Node e testar
echo automaticamente se ele iniciou corretamente.
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
set "ERR=%ERRORLEVEL%"

echo.
if not "%ERR%"=="0" (
  echo ==========================================
  echo   A INSTALACAO NAO FOI CONCLUIDA
  echo ==========================================
  echo.
  echo Esta janela foi mantida aberta de proposito
  echo para mostrar o erro. Tire uma foto desta tela
  echo e envie para diagnostico.
  echo.
  echo Log:
  echo %LOCALAPPDATA%\MillionsNestLive\logs\install.log
  echo.
  pause
  exit /b %ERR%
)

echo ==========================================
echo        INSTALACAO CONCLUIDA
echo ==========================================
echo.
echo O painel do MillionsNest Live deve ter sido
echo aberto no navegador.
echo.
echo Pressione qualquer tecla para fechar.
pause >nul
exit /b 0

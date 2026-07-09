@echo off
setlocal
title Gestor de Gastos - Modo Movil

cd /d "%~dp0"

echo.
echo ========================================
echo  Gestor de Gastos - Acceso desde movil
echo ========================================
echo.
echo Asegurate de que la PC y el celular esten en el mismo WiFi.
echo Si Windows Firewall pregunta, permite el acceso a Python.
echo.

set "LOCAL_IP="
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /c:"IPv4"') do (
  if not defined LOCAL_IP (
    for /f "tokens=* delims= " %%B in ("%%A") do set "LOCAL_IP=%%B"
  )
)

if defined LOCAL_IP (
  echo Abre esta direccion en el navegador del celular:
  echo.
  echo   http://%LOCAL_IP%:5173
  echo.
) else (
  echo No pude detectar la IP automaticamente.
  echo Ejecuta ipconfig y usa tu Direccion IPv4 con el puerto 5173.
  echo.
)

echo Servidor iniciado. No cierres esta ventana mientras uses la app.
echo Para detenerlo, presiona CTRL + C.
echo.

python -m http.server 5173 --bind 0.0.0.0

pause

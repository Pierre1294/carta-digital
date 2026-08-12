@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   Carta Digital - POC Agregadores
echo ============================================
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo ERROR: No se encontro Python en el PATH.
    echo Instala Python 3 y vuelve a intentarlo.
    pause
    exit /b 1
)

echo Verificando dependencias (flask, requests)...
python -m pip install -r requirements.txt --quiet --disable-pip-version-check

echo.
echo Iniciando servidor en http://localhost:5000 ...
start "Carta Digital - Servidor" cmd /k python backend\app.py

timeout /t 3 /nobreak >nul
start "" http://localhost:5000

echo.
echo Listo. Se abrio el navegador y el servidor sigue corriendo en otra ventana.
echo Para detener la plataforma, cierra la ventana "Carta Digital - Servidor".
echo.
pause

endlocal

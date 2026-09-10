@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set PUERTO=8765

title Finanzas personales

echo.
echo   ================================================
echo    FINANZAS PERSONALES
echo   ================================================
echo.

where python >nul 2>nul
if errorlevel 1 goto sin_python

echo   Iniciando en http://localhost:%PUERTO%/
echo.
echo   Deja ESTA VENTANA ABIERTA mientras uses la aplicacion.
echo   Para cerrarla, cierra esta ventana o pulsa Ctrl+C.
echo.

start "" /b python -m http.server %PUERTO% >nul
timeout /t 2 /nobreak >nul
start "" "http://localhost:%PUERTO%/"

echo   Aplicacion abierta en el navegador.
echo   (Si el navegador muestra un error, el puerto %PUERTO% ya estaba en uso.)
echo.
pause >nul
goto fin

:sin_python
echo   No se encontro Python en este equipo.
echo   Se abrira el archivo directamente en el navegador.
echo.
echo   Nota: si al recargar se pierden los datos, instala Python
echo   y vuelve a ejecutar este archivo.
echo.
start "" "%~dp0index.html"
timeout /t 5 /nobreak >nul

:fin
endlocal
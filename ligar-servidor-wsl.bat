@echo off
rem Dois cliques aqui: liga o servidor do Xadrez IA (Ubuntu no WSL) e mostra a URL publica.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\windows\ligar-servidor.ps1"
echo.
pause

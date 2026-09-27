@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "dist\sunny-coast-racer.html" node scripts\build-standalone.mjs
node serve-dist.mjs
pause

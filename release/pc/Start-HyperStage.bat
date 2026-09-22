@echo off
chcp 65001 >nul
title HyperStage
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
if errorlevel 1 pause

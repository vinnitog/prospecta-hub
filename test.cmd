@echo off
cd /d "%~dp0"
node --test unit/*.test.js

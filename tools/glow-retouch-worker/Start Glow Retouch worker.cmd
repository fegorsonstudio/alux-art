@echo off
title Glow Retouch worker
rem Retouches Glow Retouch orders with Fegorson Studio. Leave this window open; close it to stop.
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0"
node worker.mjs
pause

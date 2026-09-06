@echo off
setlocal
set "ASHA_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%ASHA_NODE%" (
  echo The reviewed local Node runtime was not found. Ask Codex to check the local setup.
  exit /b 1
)
cd /d "%~dp0apps\web"
"%ASHA_NODE%" --experimental-strip-types scripts/start-local-app.mjs
exit /b %ERRORLEVEL%

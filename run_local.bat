@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  set "PYTHON_CMD=py -3"
) else (
  where python >nul 2>nul
  if not %errorlevel%==0 (
    echo Python 3 is required. Install it from https://www.python.org/downloads/ and run this file again.
    pause
    exit /b 1
  )
  set "PYTHON_CMD=python"
)

if not exist ".venv\Scripts\python.exe" (
  echo Creating the local Python environment...
  %PYTHON_CMD% -m venv .venv
  if not %errorlevel%==0 (
    echo Could not create the local Python environment.
    pause
    exit /b 1
  )
)

echo Checking local dependencies...
.venv\Scripts\python.exe -m pip install --disable-pip-version-check -q -r requirements.txt
if not %errorlevel%==0 (
  echo Could not install the local dependencies. Check your internet connection and try again.
  pause
  exit /b 1
)

if not exist ".env" if exist ".env.example" (
  copy /y ".env.example" ".env" >nul
  echo Created .env from .env.example. Add provider credentials there only if you need server-side integrations.
)

start "GTM Console" http://localhost:8001
echo GTM Console is starting at http://localhost:8001
echo Keep this window open while using the app. Close it to stop the server.
.venv\Scripts\python.exe server.py
pause

@echo off
setlocal

cd /d "%~dp0"

echo [1/2] Building Mobile Pad...
wails3 build
if errorlevel 1 (
  echo Build failed.
  exit /b 1
)

echo [2/2] Compressing with UPX...
".\upx-5.2.1-win64\upx.exe" --best --lzma ".\bin\Mobile Pad.exe"
if errorlevel 1 (
  echo UPX compression failed.
  exit /b 1
)

echo Done: "%~dp0bin\Mobile Pad.exe"
endlocal

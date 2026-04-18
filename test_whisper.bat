@echo off
echo ================================
echo    WHISPER TEST SCRIPT
echo ================================

set WHISPER_PATH=E:\appsieucap\AI\whisper.cpp\build\bin\Release\whisper-cli.exe
set MODEL_PATH=E:\appsieucap\AI\whisper.cpp\models\ggml-medium-q5_0.bin
set AUDIO_PATH=%cd%\test.wav

echo.
echo Checking files...

if not exist "%WHISPER_PATH%" (
    echo ❌ whisper-cli.exe not found!
    pause
    exit /b
)

if not exist "%MODEL_PATH%" (
    echo ❌ Model not found!
    pause
    exit /b
)

if not exist "%AUDIO_PATH%" (
    echo ❌ test.wav not found in current folder!
    pause
    exit /b
)

echo ✅ All files OK
echo.

echo Running Whisper...
echo ================================

"%WHISPER_PATH%" -m "%MODEL_PATH%" -f "%AUDIO_PATH%" -l vi --temperature 0 --beam-size 3

echo.
echo ================================
echo DONE
pause
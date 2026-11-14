@echo off
rem Shares the game through ngrok. Your free ngrok dev domain stays the same every time.
where ngrok >nul 2>nul || (echo ngrok is not installed. See README.md, step 2. & pause & exit /b 1)
ngrok http 3000
pause

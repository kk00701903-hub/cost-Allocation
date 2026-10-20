@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [공동물류 원가배분] 로컬 서버를 준비합니다.
where node >nul 2>nul || (echo Node.js 가 없습니다. https://nodejs.org 에서 LTS 를 설치한 뒤 다시 실행하세요. & pause & exit /b 1)
if not exist .env.local copy env-example.txt .env.local >nul
if not exist node_modules (echo 패키지 설치 중... & call npm install || (pause & exit /b 1))
echo 빌드 중... & call npm run build || (pause & exit /b 1)
start "" http://localhost:3100
echo 서버 실행 중: http://localhost:3100  (이 창을 닫으면 서버가 꺼집니다)
call npm run start
pause

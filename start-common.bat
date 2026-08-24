@echo off
REM Delad startlogik for start-pat.bat och start-entra.bat. Anropas med lage som %1.
REM Skillnaden mellan scenarierna ar exakt en sak - Auth:Mode - och den ligger i anroparen.
setlocal

set "AUTH_MODE=%~1"
if "%AUTH_MODE%"=="" set "AUTH_MODE=Pat"

echo ==========================================================
echo   AvekiScrum lokalt  -  Auth:Mode = %AUTH_MODE%
if /i "%AUTH_MODE%"=="Pat" echo   Ingen inloggning. Kort skrivs som PAT-agaren.
if /i "%AUTH_MODE%"=="EntraWithPat" echo   Du loggar in med ditt eget konto.
echo ==========================================================
echo.

if "%AzureDevOps__PAT%"=="" (
    echo [VARNING] AzureDevOps__PAT ar inte satt i den har terminalen.
    echo Utan den kan API:t inte hamta nagot fran Azure DevOps. Satt den med:
    echo   [Environment]::SetEnvironmentVariable("AzureDevOps__PAT", "DITT_TOKEN", "User")
    echo och starta om Utforskaren.
    echo.
)

REM Bada portarna maste vara lediga. En Api som redan kor laser configen fran nar DEN startade,
REM sa den kan svara i ett helt annat lage an det du just valde - och en klient som inte kan starta
REM lamnar en gammal flik som ser levande ut men inte nar nagot.
call :CheckPort 5273 "AvekiScrum.Api" || exit /b 1
call :CheckPort 5199 "AvekiScrum.Client" || exit /b 1

echo Startar AvekiScrum.Api pa http://localhost:5273 ...
echo   (Forsta raderna i det fonstret sager projekt och lage.)
start "AvekiScrum.Api (%AUTH_MODE%)" cmd /k "cd /d "%~dp0AvekiScrum.Api" && set Auth__Mode=%AUTH_MODE% && dotnet run --launch-profile http"

echo Startar AvekiScrum.Client pa http://localhost:5199 ...
start "AvekiScrum.Client" cmd /k "cd /d "%~dp0AvekiScrum.Client" && npm run dev -- --open"

echo.
echo Bada delarna kor i egna fonster. Stang dem, eller Ctrl+C, for att stoppa.
echo Byta lage: stang bada fonstren och kor den andra bat-filen.
endlocal
exit /b 0

:CheckPort
netstat -ano | findstr /R /C:":%~1 .*LISTENING" >nul
if errorlevel 1 exit /b 0
echo [STOPP] Nagot lyssnar redan pa port %~1 - troligen %~2 fran tidigare.
echo.
netstat -ano ^| findstr /R /C:":%~1 .*LISTENING"
echo.
echo Stang det fonstret, eller avsluta processen:
echo   powershell -Command "Get-NetTCPConnection -LocalPort %~1 -State Listen ^| ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"
echo.
pause
exit /b 1

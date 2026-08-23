@echo off
setlocal

if "%AzureDevOps__PAT%"=="" (
    echo [VARNING] Miljovariabeln AzureDevOps__PAT verkar inte vara satt i denna terminal.
    echo Om AvekiScrum.Api inte kan hamta data fran Azure DevOps, satt den via:
    echo   [Environment]::SetEnvironmentVariable("AzureDevOps__PAT", "DITT_TOKEN", "User")
    echo och starta sedan om terminalen/Utforskaren.
    echo.
)

REM En Api som redan lyssnar pa 5273 ar nastan alltid en gammal instans. Den lasar in appsettings
REM vid start, sa den fortsatter servera det projekt som gallde da - och sandladan ser likadan ut
REM som skarpa projektet. Da ar det battre att vagra starta an att lata den svara vidare.
netstat -ano | findstr /R /C:":5273 .*LISTENING" >nul
if not errorlevel 1 (
    echo [STOPP] Nagot lyssnar redan pa port 5273 - troligen en Api-instans som redan kor.
    echo.
    echo Den laser configen vid start, sa den kan kora mot ett annat projekt an det du just
    echo stallde in. Stang det fonstret, eller avsluta processen:
    echo.
    netstat -ano ^| findstr /R /C:":5273 .*LISTENING"
    echo.
    echo   powershell -Command "Get-NetTCPConnection -LocalPort 5273 -State Listen ^| ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"
    echo.
    pause
    exit /b 1
)

echo Startar AvekiScrum.Api pa http://localhost:5273 ...
echo (Forsta raden i det fonstret sager vilket Azure DevOps-projekt som galler.)
start "AvekiScrum.Api" cmd /k "cd /d "%~dp0AvekiScrum.Api" && dotnet run --launch-profile http"

echo Startar AvekiScrum.Client pa http://localhost:5199 ...
start "AvekiScrum.Client" cmd /k "cd /d "%~dp0AvekiScrum.Client" && npm run dev -- --open"

echo.
echo Bada delarna startar i egna fonster (Api oppnar aven Swagger automatiskt).
echo Stang fonstren, eller tryck Ctrl+C i respektive fonster, for att stoppa dem.

endlocal

@echo off
setlocal

if "%AzureDevOps__PAT%"=="" (
    echo [VARNING] Miljovariabeln AzureDevOps__PAT verkar inte vara satt i denna terminal.
    echo Om AvekiScrum.Api inte kan hamta data fran Azure DevOps, satt den via:
    echo   [Environment]::SetEnvironmentVariable("AzureDevOps__PAT", "DITT_TOKEN", "User")
    echo och starta sedan om terminalen/Utforskaren.
    echo.
)

echo Startar AvekiScrum.Api pa http://localhost:5273 ...
start "AvekiScrum.Api" cmd /k "cd /d "%~dp0AvekiScrum.Api" && dotnet run --launch-profile http"

echo Startar AvekiScrum.Client pa http://localhost:5173 ...
start "AvekiScrum.Client" cmd /k "cd /d "%~dp0AvekiScrum.Client" && npm run dev -- --open"

echo.
echo Bada delarna startar i egna fonster (Api oppnar aven Swagger automatiskt).
echo Stang fonstren, eller tryck Ctrl+C i respektive fonster, for att stoppa dem.

endlocal

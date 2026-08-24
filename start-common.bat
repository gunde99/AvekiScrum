@echo off
REM Delad startlogik for start-pat.bat och start-entra.bat. Anropas med lage som %1.
REM Skillnaden mellan scenarierna ar exakt en sak - Auth:Mode - och den ligger i anroparen.
REM
REM Andra argumentet: "force" stoppar det som redan hall portarna utan att fraga. Anvands nar man
REM vet vad man gor och inte vill svara pa en fraga varje gang.
setlocal EnableDelayedExpansion

set "AUTH_MODE=%~1"
if "%AUTH_MODE%"=="" set "AUTH_MODE=Pat"
set "FORCE="
if /i "%~2"=="force" set "FORCE=1"

echo ==========================================================
echo   AvekiScrum lokalt  -  Auth:Mode = %AUTH_MODE%
if /i "%AUTH_MODE%"=="Pat" echo   Ingen inloggning. Kort skrivs som PAT-agaren.
if /i "%AUTH_MODE%"=="EntraWithPat" echo   Du loggar in med ditt eget konto.
echo ==========================================================
echo.

REM Parenteserna i exempelkommandot maste escapas med ^. Oescapade stanger de if-blocket har mitt i,
REM sa varningen kapades och sista raden skrevs ut aven nar PAT-en var satt.
if "%AzureDevOps__PAT%"=="" (
    echo [VARNING] AzureDevOps__PAT ar inte satt i den har terminalen.
    echo Utan den kan API:t inte hamta nagot fran Azure DevOps. Satt den med:
    echo   [Environment]::SetEnvironmentVariable^("AzureDevOps__PAT", "DITT_TOKEN", "User"^)
    echo och starta om Utforskaren.
    echo.
)

REM Bada portarna maste vara lediga. En Api som redan kor laser configen fran nar DEN startade, sa
REM den kan svara i ett helt annat lage an det du just valde - och en klient som inte kan starta
REM lamnar en gammal flik som ser levande ut men inte nar nagot.
call :FreePort 5273 "AvekiScrum.Api" || exit /b 1
call :FreePort 5199 "AvekiScrum.Client" || exit /b 1

echo Startar AvekiScrum.Api pa http://localhost:5273 ...
echo   (Forsta raderna i det fonstret sager projekt och lage.)
REM Citattecknen runt hela tilldelningen ar inte kosmetika: "set X=Pat && ..." tar med blanksteget
REM fore && i vardet, sa lagert blir "Pat " och matchar ingenting.
start "AvekiScrum.Api (%AUTH_MODE%)" cmd /k "cd /d "%~dp0AvekiScrum.Api" && set "Auth__Mode=%AUTH_MODE%" && dotnet run --launch-profile http"

echo Startar AvekiScrum.Client pa http://localhost:5199 ...
start "AvekiScrum.Client" cmd /k "cd /d "%~dp0AvekiScrum.Client" && npm run dev -- --open"

echo.
echo Bada delarna kor i egna fonster.
echo Stoppa dem med Ctrl+C i respektive fonster - att bara stanga fonstret lamnar kvar processen.
echo Byta lage: kor den andra bat-filen, den erbjuder sig att stada undan det som kor.
endlocal
exit /b 0

REM ---------------------------------------------------------------------------------------------
REM  :FreePort <port> <namn>
REM
REM  Att stanga fonstret racker inte: "dotnet run" och "npm run dev" startar den riktiga processen
REM  som ett barn, och den overlever nar cmd forsvinner. Da finns inget fonster kvar att stanga och
REM  ingen synlig ledtrad till vad som haller porten. Darfor erbjuder skriptet sig att doda den.
REM ---------------------------------------------------------------------------------------------
:FreePort
set "PORT=%~1"
set "WHAT=%~2"
call :FindPids %PORT%
if not defined PIDS exit /b 0

echo [UPPTAGEN] Port %PORT% halls redan av - troligen %WHAT% fran tidigare.
for %%p in (!PIDS!) do (
    for /f "tokens=1" %%n in ('tasklist /fi "PID eq %%p" /nh 2^>nul') do echo    pid %%p  %%n
)
echo.

if defined FORCE goto :FreePortKill
choice /c JN /n /m "Stoppa den och fortsatt? [J/N] "
if errorlevel 2 (
    echo.
    echo Avbrutet. Inget startades.
    exit /b 1
)
echo.

:FreePortKill
for %%p in (!PIDS!) do (
    echo Stoppar pid %%p ...
    taskkill /PID %%p /T /F >nul 2>&1
)

REM Kort paus - Windows slapper porten strax efter att processen dott.
ping -n 3 127.0.0.1 >nul
call :FindPids %PORT%
if defined PIDS (
    echo.
    echo [FEL] Port %PORT% ar fortfarande upptagen. Kor kommandotolken som administrator,
    echo eller titta efter processen manuellt:
    echo   netstat -ano ^| findstr :%PORT%
    echo.
    pause
    exit /b 1
)
echo Port %PORT% ar ledig.
echo.
exit /b 0

REM Samlar unika pid:ar som LYSSNAR pa porten i PIDS. Bade IPv4 och IPv6 kan ge var sin rad for
REM samma process, darav dubblettkontrollen.
:FindPids
set "PIDS="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":%~1 .*LISTENING"') do (
    echo !PIDS! | findstr /c:" %%p " >nul || set "PIDS=!PIDS! %%p "
)
exit /b 0

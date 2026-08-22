<#
.SYNOPSIS
    Bygger klienten, lägger den i API:ts wwwroot och publicerar hela appen.

.DESCRIPTION
    Hela kedjan i ett kommando, i rätt ordning. Ordningen är själva poängen: dotnet publish tar
    med wwwroot precis som den ser ut just då, så en klientändring som inte byggts om följer helt
    enkelt inte med - och webbläsaren kör vidare på den gamla bundlen hur många gånger man än
    publicerar.

.PARAMETER SkipClient
    Hoppar över klientbygget. Bara för ändringar som enbart rör API:t.

.PARAMETER DeployTo
    Kopierar resultatet hit efteråt, till exempel C:\Applications\AvekiScrum\SPA eller en
    UNC-sökväg. Utelämnas den stannar allt i .\publish.

.PARAMETER AppPool
    Applikationspool att stoppa under kopieringen och starta efteråt. Krävs vid DeployTo mot en
    körande site - annars är AvekiScrum.Api.dll låst. Fungerar bara när skriptet körs på servern.

.EXAMPLE
    .\publish.ps1
    Bygger allt till .\publish. Kopiera själv därifrån.

.EXAMPLE
    .\publish.ps1 -DeployTo C:\Applications\AvekiScrum\SPA -AppPool AvekiScrum
    Hela vägen ut, körd på servern.

.EXAMPLE
    .\publish.ps1 -SkipClient
    Bara API:t, när ingenting i klienten ändrats.
#>
[CmdletBinding()]
param(
    [switch]$SkipClient,
    [string]$DeployTo,
    [string]$AppPool,
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$clientDir = Join-Path $root "AvekiScrum.Client"
$apiProject = Join-Path $root "AvekiScrum.Api\AvekiScrum.Api.csproj"
$wwwroot = Join-Path $root "AvekiScrum.Api\wwwroot"
$publishDir = Join-Path $root "publish"
$started = Get-Date

function Write-Step([string]$text) {
    Write-Host ""
    Write-Host "──  $text" -ForegroundColor Cyan
}

function Assert-Tool([string]$name, [string]$hint) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "$name hittades inte i PATH. $hint"
    }
}

# ---------------------------------------------------------------------------------------------
# 1. Klienten
# ---------------------------------------------------------------------------------------------
if ($SkipClient) {
    Write-Step "Hoppar över klientbygget (-SkipClient)"
    if (-not (Test-Path (Join-Path $wwwroot "index.html"))) {
        throw "wwwroot saknar index.html. Kör utan -SkipClient minst en gång först."
    }
} else {
    Assert-Tool "npm" "Installera Node.js."
    Write-Step "Bygger klienten"

    Push-Location $clientDir
    try {
        if (-not (Test-Path (Join-Path $clientDir "node_modules"))) {
            Write-Host "node_modules saknas - kör npm ci (tar en stund första gången)."
            npm ci
            if ($LASTEXITCODE -ne 0) { throw "npm ci misslyckades." }
        }

        # Läser .env.production, som ger client-id, tenant och scope.
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build misslyckades." }
    } finally {
        Pop-Location
    }

    Write-Step "Kopierar klienten till wwwroot"
    if (Test-Path $wwwroot) { Remove-Item $wwwroot -Recurse -Force }
    Copy-Item (Join-Path $clientDir "dist") $wwwroot -Recurse

    if (-not (Test-Path (Join-Path $wwwroot "index.html"))) {
        throw "wwwroot fick ingen index.html - byggde vite verkligen till dist/?"
    }
}

# ---------------------------------------------------------------------------------------------
# 2. API:t
# ---------------------------------------------------------------------------------------------
Assert-Tool "dotnet" "Installera .NET 8 SDK."
Write-Step "Publicerar API:t ($Configuration)"

if (Test-Path $publishDir) { Remove-Item $publishDir -Recurse -Force }
dotnet publish $apiProject -c $Configuration -o $publishDir --nologo
if ($LASTEXITCODE -ne 0) { throw "dotnet publish misslyckades." }

# Fångar det som annars upptäcks först i webbläsaren: klienten kom inte med.
if (-not (Test-Path (Join-Path $publishDir "wwwroot\index.html"))) {
    throw "publish\wwwroot\index.html saknas. Klienten kom inte med i publiceringen."
}

$bundle = Get-ChildItem (Join-Path $publishDir "wwwroot\assets") -Filter "*.js" -ErrorAction SilentlyContinue |
    Sort-Object Length -Descending | Select-Object -First 1
Write-Host ("Klientbundle: {0} ({1:N0} kB)" -f $bundle.Name, ($bundle.Length / 1KB))

# ---------------------------------------------------------------------------------------------
# 3. Ut på servern
# ---------------------------------------------------------------------------------------------
if ($DeployTo) {
    Write-Step "Driftsätter till $DeployTo"

    $poolWasStopped = $false
    if ($AppPool) {
        Import-Module WebAdministration -ErrorAction Stop
        if ((Get-WebAppPoolState -Name $AppPool).Value -eq "Started") {
            Write-Host "Stoppar app pool $AppPool (annars är AvekiScrum.Api.dll låst)."
            Stop-WebAppPool -Name $AppPool
            # Stop-WebAppPool återvänder innan processen faktiskt dött.
            $deadline = (Get-Date).AddSeconds(30)
            while ((Get-WebAppPoolState -Name $AppPool).Value -ne "Stopped" -and (Get-Date) -lt $deadline) {
                Start-Sleep -Milliseconds 500
            }
            $poolWasStopped = $true
        }
    }

    try {
        if (-not (Test-Path $DeployTo)) { New-Item -ItemType Directory $DeployTo -Force | Out-Null }

        # /E kopierar allt, men utan /PURGE: logs-mappen och allt annat som hör servern till får
        # ligga kvar. Gamla hashade assets blir kvar också, vilket är harmlöst - de refereras inte.
        robocopy $publishDir $DeployTo /E /NFL /NDL /NJH /NJS /R:3 /W:2 | Out-Null
        # Robocopy använder exitkoder < 8 för "gick bra", till skillnad från allt annat.
        if ($LASTEXITCODE -ge 8) { throw "robocopy misslyckades med kod $LASTEXITCODE." }
        Write-Host "Kopierat."
    } finally {
        if ($poolWasStopped) {
            Start-WebAppPool -Name $AppPool
            Write-Host "App pool $AppPool startad igen."
        }
    }
}

Write-Step ("Klart på {0:N0} sekunder" -f ((Get-Date) - $started).TotalSeconds)
if (-not $DeployTo) {
    Write-Host "Resultatet ligger i $publishDir - kopiera det till sitens mapp." -ForegroundColor Yellow
    Write-Host "Stoppa app poolen först, annars är AvekiScrum.Api.dll låst." -ForegroundColor Yellow
}

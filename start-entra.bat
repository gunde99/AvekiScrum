@echo off
REM =============================================================================================
REM  Scenario 2: inloggning lokalt, pa intranatet.
REM
REM  API:t kors med Auth:Mode=EntraWithPat: du loggar in med ditt eget konto, API:t ar stangt for
REM  anonyma anrop, och ditt namn hamnar som rapportor. Azure DevOps nas fortfarande med den delade
REM  PAT-en - skillnaden mot fullt Entra-lage ar bara vem Azures egen historik pekar ut, och det
REM  kraver admin consent.
REM
REM  Kraver AzureDevOps__PAT, och att http://localhost:5199/ finns som redirect-URI pa
REM  SPA-registreringen. Ingen klienthemlighet behovs i det har laget.
REM
REM  Holls portarna av en gammal instans erbjuder skriptet sig att stoppa den. "start-entra.bat force"
REM  gor det utan att fraga.
REM =============================================================================================
call "%~dp0start-common.bat" EntraWithPat %1

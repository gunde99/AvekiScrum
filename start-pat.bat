@echo off
REM =============================================================================================
REM  Scenario 1: bara PAT. Ingen inloggning, inget behov av VPN eller intranat.
REM
REM  API:t kors med Auth:Mode=Pat, och klienten hoppar over MSAL helt - den fragar /api/health
REM  forst och ratter sig efter svaret. Ditt namn hamnar alltsa inte pa korten; allt skrivs som
REM  PAT-agaren. Det ar priset for att kunna jobba utan att na Entra.
REM
REM  Kraver miljovariabeln AzureDevOps__PAT.
REM =============================================================================================
call "%~dp0start-common.bat" Pat

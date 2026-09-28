@echo off
REM =============================================================================================
REM  Vice-SM-genvag: samma som start-pat.bat (Scenario 1 - bara PAT, ingen inloggning), men hoppar
REM  over startsidan och oppnar direkt i Daily-boarden. Tank kioskläge for nagon som bara ska in i
REM  daily-flodet, inte valja app forst.
REM
REM  Kraver miljovariabeln AzureDevOps__PAT - se docs/VICE_SM_PAT.md for hur man skapar en och
REM  vilka rattigheter den behover.
REM
REM  Vilket team som visas forst avgors av "Team"-valjaren uppe till hoger i appen, inte har -
REM  klick och det ligger kvar till nasta gang.
REM
REM  Holls portarna av en gammal instans stoppas den utan att fraga - den ar en tidigare korning av
REM  precis det har. "vice-SM.bat ask" aterinfor fragan.
REM =============================================================================================
REM "%1" (quoted, not bare %1) is deliberate: when this is double-clicked, %1 is empty, and an
REM unquoted empty %1 doesn't reserve its slot in the argument list - the open-path after it
REM silently shifts back into start-common.bat's %2 (the "ask" slot) instead of its %3, and
REM start-common.bat falls back to opening "/" instead. "%1" always occupies its position, even
REM as "" when nothing was passed.
call "%~dp0start-common.bat" Pat "%1" "/?board=dailys"

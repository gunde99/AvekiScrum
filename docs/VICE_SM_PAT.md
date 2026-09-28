# Installera AvekiScrum hos en kollega (vice-SM)

Scenariot: en kollega ska bara kunna öppna Daily-boarden och redigera kort - ingen inloggning,
ingen egen utveckling. `vice-SM.bat` (rotmappen) startar appen i samma läge som `start-pat.bat`
(se [LOKAL_UTVECKLING.md](LOKAL_UTVECKLING.md), "1. Bara PAT") men hoppar över startsidan och
öppnar direkt i Daily-boarden.

## Räcker det att kopiera mappen + sätta en miljövariabel?

Nästan - kollegan behöver också ha två program installerade som inte ingår i mappen:

1. **.NET 8 SDK** - https://dotnet.microsoft.com/download/dotnet/8.0 (API:t körs med `dotnet run`,
   inget färdigbyggt .exe ligger i mappen).
2. **Node.js** (LTS, 18 eller senare) - https://nodejs.org (klienten körs med `npm run dev`).

Sedan:

3. **Kopiera hela `AvekiScrum`-mappen.** Om kopian görs som en vanlig fil-/mappkopiering (inte
   `git clone`) följer `node_modules`, `bin` och `obj` med automatiskt och kollegan slipper köra
   `npm install`/`dotnet restore` själv. Kommer mappen istället från git (klonad, eller en zip av
   ett rent arkiv) saknas de mapparna - kör då `npm install` i `AvekiScrum.Client` en gång; `dotnet
   run` sköter sin egen restore automatiskt.
4. **Kontrollera `AvekiScrum.Api/appsettings.json` → `Testing.ProjectOverride` är tomt (`""`)**
   innan kopian skickas iväg. Är den satt till `"ScrumLab"` (används för att testa nya fält, se
   samma fil) hamnar kollegan i sandlådeprojektet och ser inte de riktiga sprintkorten. En gul
   "Sandlåda: ScrumLab"-etikett uppe till höger i appen avslöjar om överstyrningen råkar stå kvar.
5. **Miljövariabeln `AzureDevOps__PAT`** - en egen Personal Access Token, satt på kollegans egen
   maskin (aldrig i någon fil som följer med mappen). Se nästa avsnitt.

Inget annat är maskinspecifikt: `appsettings.json` pekar redan mot `https://dev.azure.com/Aveki`,
och klienten pratar alltid med `http://localhost:5273` (API:t på samma maskin) oavsett vems dator
det är.

## Skaffa en PAT

1. Gå till `https://dev.azure.com/Aveki/_usersSettings/tokens` (inloggad med kollegans eget
   Aveki-konto).
2. **+ New Token**.
3. **Name**: något igenkännbart, t.ex. `AvekiScrum lokal`.
4. **Organization**: `Aveki`.
5. **Expiration**: valfritt, men sätt en påminnelse - går token ut slutar Daily-boarden fungera
   med ett 401-fel tills en ny skapas och miljövariabeln uppdateras.
6. **Scopes**: välj **Custom defined**, inte "Full access" - se nästa avsnitt för exakt vilka.
7. **Create**, kopiera token direkt (den visas bara en gång).

## Minsta rättigheter

| Scope | Krävs? | Varför |
|---|---|---|
| **Work Items → Read & write** | **Ja, alltid** | Allt Daily-boarden faktiskt gör: hämta sprintens kort, öppna och redigera dem (alla fält, inte bara vissa), kommentera, bifoga bilder, skapa Tasks/länkade kort, Korthygien/Behovsbedömning/INVEST/DoR/DoD-flikarna. Detta är den enda strikt nödvändiga scopen. |
| **Wiki → Read** | Rekommenderas | Sprintmålens rubrik/beskrivning/delmål hämtas från en Wiki-sida (`PlanningBoard:SprintGoalsWikiUrls` i `appsettings.json`, redan ifylld för både Nord och Syd). Utan scopen visar boarden korten ändå, bara utan sprintmålens egen text. |
| **Code → Read** | Valfritt | Gör att ett korts kopplade Pull Request visas med riktig titel/granskare i stället för bara länken. Saknas scopen faller kortvyn tyst tillbaka till den enklare varianten - inget går sönder. |

Allt annat (Board/Team-inställningar, projektmedlemmar, testplaner, builds) läses antingen från
appens egen lokala konfiguration eller anropas inte alls från Daily-boarden - lägg inte till fler
scopes "för säkerhets skull". En bredare token än nödvändigt är bara en större risk om den skulle
läcka.

## Sätt miljövariabeln

I PowerShell, som kollegans egen användare (kör **inte** som administratör - `"User"` sist gör att
den sparas på användarnivå):

```powershell
[Environment]::SetEnvironmentVariable("AzureDevOps__PAT", "KLISTRA_IN_TOKEN_HAR", "User")
```

Starta om Utforskaren (eller logga ut och in) så att nya terminalfönster ser variabeln.

## Starta

Dubbelklicka `vice-SM.bat` i `AvekiScrum`-mappens rot. Två fönster öppnas (API + klient) och
webbläsaren går direkt till Daily-boarden - ingen startsida, inget appval. Vilket team (Nord/Syd)
som visas väljs med Team-knapparna uppe till höger i appen och kommer ihåg sig till nästa gång.

Stäng med **Ctrl+C** i respektive fönster, inte bara krysset - se "Kvarglömda processer" i
[LOKAL_UTVECKLING.md](LOKAL_UTVECKLING.md) för varför.

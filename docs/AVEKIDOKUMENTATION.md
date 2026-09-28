# AvekiDokumentation (POC)

Ny startsidesingång: **AvekiDokumentation**, med två vyer (Konsult / Dokumentatör). Löser problemet
att hjälptextkort blockerar utvecklingskorten - se bakgrund/beslut i sessionsloggen. Helt additiv:
inget befintligt flöde är ändrat, allt nytt sitter på nya knappar/vyer.

## Vad som redan fanns (verifierat mot live Azure DevOps innan detta byggdes)

- **Dokumentation** är ett eget Azure DevOps Team Project, skilt från **Utveckling**.
- Wikin `Dokumentation.wiki` (sida "Hjälptext och dokumentation") dokumenterar rutinen: TD skapar en
  Task under User Story **BESTÄLLNING** (id `21474`), applicerar Task-mallen **Hjälptextmall**
  (Dokumentation-projektets eget team, inte de äldre `Hjälptextmall - Nord/Syd` i Utveckling som hör
  till en utfasad rutin), och länkar den **Related** (aldrig Child) till kortet i Utveckling.
- 250+ befintliga kort följer redan detta mönster live (`Hjälptext - …`-titel, `Parent` = en av tre
  hink-User Stories i Dokumentation, `Related` → kortet i Utveckling).
- `TeamRoleConfig.TechnicalWriter` (appsettings) listar redan de two konsulterna som skriver texterna.

Den nya knappen automatiserar exakt detta mönster istället för att uppfinna ett nytt.

## Vad som är nytt

**Backend** (allt additivt - inga befintliga metoder/endpoints ändrade):

- `appsettings.json`: `Documentation:ProjectName` ("Dokumentation") och
  `Documentation:BestallningStoryId` (21474).
- `IAzureDevOpsBoardsClient/AzureDevOpsBoardsClient.CreateCrossProjectHelpTextTaskAsync(...)`: skapar
  en Task i **ett annat projekt** än det konfigurerade (Utveckling). Enda skrivoperationen som är
  projekt-specifik - läsning/WIQL fungerar redan org-brett oavsett vilket projekts URL man frågar
  mot (verifierat: WIQL mot Utvecklings-endpointen med `TeamProject='Dokumentation'` hittar
  Dokumentation-kort utan problem).
- Samma forwardat genom `IAzureDevOpsService`.
- `POST /api/documentation/helptext-tasks` - skapar kortet (Parent=BESTÄLLNING, Related=källkortet).
- `GET /api/documentation/helptext-tasks` - listar alla öppna `Hjälptext - …`-Tasks i Dokumentation
  (oavsett om de skapades här eller för hand av TD).

**Frontend**:

- Ny knapp **"Beställ hjälptext"** i `WorkItemModal`s footer (US/Bug), bredvid "Validering" -
  additiv, rör inte DoR-checklistans egen "Hjälptext"-rad (som fortfarande skapar sin separata
  User Story i Utveckling, oförändrat).
- `RequestHelpTextModal` - formulär med samma tre fält som den riktiga Hjälptextmall-mallen (Ny/
  befintlig topic, Ändring, Skärmbild(er)), byggt med samma mönster som AvekiSupports bugformulär.
- Ny startsidesingång **AvekiDokumentation** (`/startbilder/dokumentation.svg` - en enkel
  platshållarbild, inte ett riktigt foto, se `CREDITS.md`).
- Två vyer:
  - **Konsult**: lista över öppna hjälptextkort (default "Tilldelade mig").
  - **Dokumentatör**: samma lista (default "Alla öppna").
  - Att öppna en rad visar kortet **sida vid sida** med det länkade källkortet
    (`HelpTextSideBySide`), båda som riktiga redigerbara `WorkItemModal`-instanser (embedded-läge).

## Testa live

1. Öppna ett US/Bug i AvekiScrum, klicka **Beställ hjälptext**, fyll i och skapa.
2. Verifiera i Azure DevOps: nytt kort under BESTÄLLNING i Dokumentation, taggat/länkat Related till
   källkortet, källkortet **oförändrat** (bara en ny länk i Links-fliken).
3. Öppna AvekiDokumentation från startsidan → Konsult, hitta kortet, öppna det - källkortet ska visas
   bredvid.
4. Verifiera att det befintliga DoR-checklistans "Hjälptext"-rad fortfarande fungerar som förut.

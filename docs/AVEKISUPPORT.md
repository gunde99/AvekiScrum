# AvekiSupport

Den andra ingången från startsidan. Tänkt för sällan-användare: supporten ska kunna skriva ett
användbart buggkort på ett par minuter och sedan följa det, utan att lära sig Azure DevOps
webbgränssnitt.

## Vad som händer när ett ärende skickas

Ett vanligt **Bug**-work item skapas i samma projekt som resten – det finns ingen separat lagring.

| Fält på kortet | Kommer från |
|---|---|
| `System.Title` | Rubrik |
| `Microsoft.VSTS.TCM.ReproSteps` | De fyra beskrivningsfälten, hopslagna i mallens ordning |
| `Microsoft.VSTS.Common.Severity` | Allvarlighetsgrad (riktig picklista från processmallen) |
| `Custom.Source` | Källa |
| `Microsoft.VSTS.TCM.SystemInfo` | System Info |
| `Custom.Stakeholders` | Berörda, en `<div><b>Kategori:</b> Namn (notering)</div>` per rad |
| `System.AreaPath` | Area Path – förvald efter rapportörens team, se nedan |
| `System.IterationPath` | Iteration – förvalt `Support:BacklogIterationPath`, dvs. PO:s backlogg |
| `System.Tags` | `Support:BugTag` (default `AvekiSupport`) |
| `Custom.Externallink` | Länk till Lime-ärendet (observera litet "l" i fältnamnet) |

## Vilka buggar räknas som supportens

Två saker gör en bugg till supportens, och det räcker med den ena:

1. **Support-taggen** – satt automatiskt på allt som skapas här.
2. **External link är ifylld** – det är så supporten redan märker sina ärenden när de skapar dem
   direkt i Azure. Det är den regeln som gör att de flera hundra redan inrapporterade buggarna
   dyker upp i översikten utan att någon behöver tagga om dem.

## Repro steps-mallen

Fyra separata fält i stället för en textruta med rubriker i:

1. Kort beskrivning om buggen
2. Steg för att återskapa buggen
3. Förväntat resultat (innan bugg)
4. Faktiskt resultat (vid bugg)

De slås ihop till en text med rubrikerna i samma ordning varje gång. Rubriker skrivs ut även för
tomma fält – ett kort utan rubrik ser ut som att frågan glömdes bort, inte som att svaret var
"inget".

Varje fält är en `RichTextEditor`, så en skärmdump kan klistras in direkt från urklipp (Ctrl+V) var
som helst i texten och syns på plats medan man skriver – precis som i Azure. Därför finns ingen
separat ruta för skärmbilder: en bild hör hemma vid det steg den illustrerar, inte i en låda längst
ned.

Minimikravet för att kunna skicka är rubrik, ditt namn, och antingen en beskrivning eller steg.

## Var ärendet hamnar

**Area Path** är förvald efter vilket team rapportören tillhör – `myCarta` för Nord,
`Energi- och VA-banken` för Syd, konfigurerat under `Support:TeamAreaPaths`. Teamet läses ur
rollgrupperna i `TeamRoleConfig` (supportpersonalen ligger i `StakeholdersTeam*`), så ingen andra
namnlista behöver underhållas. Pekar konfigurationen på en sökväg projektet inte har – vilket är
normalfallet i ScrumLab-sandlådan – används `Support:DefaultAreaPath` i stället, för en förvald
sökväg Azure inte känner igen får hela sparningen att fallera.

**Iteration** har tre sorters val: *Produktbacklogg* (förvalt), den sprint som pågår just nu, och de
sprintar som ligger kvar i samma release. Passerade sprintar utelämnas – en bugg som rapporteras
idag kan inte höra hemma i en sprint som redan stängt. "Aktuell release" är den mapp den pågående
sprinten ligger i, inte en version ur konfigurationen: de två skiljer sig åt så fort en release
skjuts fram, och sprinten är den som vet vad teamet faktiskt jobbar mot.

Listan byggs ur projektets egna iterationsnoder (`GetIterationNodesAsync`), inte ur
team-inställningarna – de senare kräver ett team med exakt rätt namn, och sandlådan har inga.

## Berörda (stakeholders)

Läggs till en i taget: kategori (`Buggrapportör`, `Support`, `Intern`, `Kund`), namn och en valfri
notering (kontaktperson, ärendenummer, datum). Buggrapportören fylls i automatiskt från namnet
högst upp och går inte att ta bort.

Anledningen till att det inte är en fritextruta: fältet i Azure innehåller idag handskrivna rader i
ett dussin olika format, vilket gör det oanvändbart att söka i. Kategorierna definieras i
`SupportBugs.StakeholderCategories` på servern så att etiketten i formuläret och etiketten som
skrivs till Azure inte kan glida isär.

## Vem rapporterade?

Två källor, i den här ordningen:

1. Kortets **Buggrapportör-rad** i Stakeholders – det som verktyget själv skriver.
2. **`System.CreatedBy`** – för buggar som skapats för hand i Azure är det supportpersonen själv.

Ordningen spelar roll: kort som *det här verktyget* skapar får PAT-ägaren som CreatedBy, eftersom
det inte finns någon inloggning än. Rapportören skriver därför sitt namn själv (sparas i
webbläsarens localStorage) och det är det namnet "Mina ärenden" jämför mot – utan hänsyn till
diakriter, så "Sofie Backo" hittar ändå Sofie Backös ärenden.

Byt ut det mot Aveki ID-identiteten så fort inloggningen finns: resten av verktyget frågar bara
efter ett namn (`src/support/reporter.ts`).

## Berörda på befintliga kort

Stakeholders-fältet på de gamla korten är fritext i ett dussin format: `<div>`-rader, `<br>`,
inklistrad Word-markup, kommatecken, ärendenummer. Översikten läser det ändå, best-effort:

- Namn som matchar någon i företaget blir **Support**. Listan byggs av `TeamRoleConfig` plus
  `Support:AdditionalCompanyNames` (för support och sälj som inte sitter i något Scrum-team).
- Allt annat som står kvar på raden blir **Kund** – "Lidköping Matilda Smedman", "Sollentuna (SEOM)".

Matchningen är avsiktligt försiktig. Ett helt namn matchar var som helst på raden (även med ett
mellannamn emellan, "Alva Widerberg Palmfeldt"), men ett ensamt förnamn godtas bara när det står
själv på raden eller efter ett bindeord ("Trollhättan via Emma"). Utan den regeln blev
"Dala Vatten, Fredrik Knapp" en kollega vid namn Fredrik och en kund som hette "Dala Vatten, Knapp".

Fältet läses som rå html, inte den `;`-splittade listan som boarden använder – inklistrad css och
`&nbsp;` innehåller båda semikolon.

## Status på dashboarden

| Status | Betyder |
|---|---|
| **I backloggen** | `New`, och iterationen är projektroten – ingen har planerat in den än |
| **Inplanerad** | `New`, men ligger i en sprint |
| **Under arbete** | `Active` |
| Löst – testas | `Resolved` |
| Klar | `Closed` |

De tre första är de supporten faktiskt frågar om, så de får färg och plats; de två sista är frågor
som redan är besvarade och tonas ned.

Härleds i `SupportBugs.StatusFor`, speglas av `SUPPORT_STATUSES` i klienten. "Inplanerad" avgörs på
iterationens *djup*, inte på projektnamnet: buggar från före projektbytet ligger kvar under den
gamla roten (`Utveckling\v27.1\sp2`), och en namnjämförelse hade kallat varenda en oplanerad.

## Listan

Sorterbar på alla kolumner (klick på rubriken växlar riktning): id, status, rubrik, allvarlighet,
version, Area Path, sprint, kund, rapportör, tilldelad, skapad, ändrad. Area Path skrivs alltid på
en rad – en radbruten sökväg går inte att läsa – och tabellen scrollar i sidled i stället.
Sprint-kolumnen är tom för allt som ligger kvar i backloggen; projektroten på egen hand säger inget.

Filtren ligger bakom en Filter-knapp med en panel, precis som på Dailys-boarden: fritext,
statuspiller (i samma färger som statusarna har i listan), version, samt Area Path, Konsult och
Kund som flerval. Statuskorten högst upp fungerar också som filterknappar och håller sig i synk med
pillren. Knappen visar en siffra när något är valt.

"Konsult" är den som rapporterat in buggen – Buggrapportör-raden på våra egna kort, kortets skapare
på de handskrivna. Samma värde som Rapportör-kolumnen, så filtret och kolumnen alltid stämmer.

**Datumintervallet är ett serverparameter**, inte ett klientfilter: det finns flera hundra ärenden,
och att hämta alla för att sedan dölja de flesta är både långsamt och missvisande om vad listan
innehåller. Matchar intervallet fler än 600 ärenden hämtas de senaste och listan säger det.

Version läses från både taggar (`27.1`) och iterationssökvägen (`v27.1`) – båda vanorna finns.

Klick på en rad öppnar samma work item-vy som Scrum-boarden använder, så supporten kan läsa
diskussionen och kommentera. Ingen pil vid id:t i listan: klicket stannar i appen. Pilen sitter i
kortet i stället, där man faktiskt lämnar – `#id ↗` till Azure DevOps och `Lime ↗` till ärendet
buggen kom ifrån.

Stängs kortet utan att något skrivits laddas listan **inte** om. Att läsa ett kort ändrar ingenting
i Azure, och att hämta hundratals buggar på nytt för att landa i exakt samma lista är arbete för
ingenting – kortet rapporterar själv om det skrev något.

## Konfiguration

```json
"Support": {
  "BugTag": "AvekiSupport",
  "BacklogIterationPath": "",
  "DefaultAreaPath": "",
  "TeamAreaPaths": { "Nord": "myCarta", "Syd": "Energi- och VA-banken" },
  "DefaultSeverity": "3 - Medium",
  "DefaultSource": "Customer",
  "AdditionalCompanyNames": ["Namn på kollega som inte sitter i något Scrum-team"],
  "SystemInfoTemplate": "Produkt/app: \nVersion: \n…"
}
```

`SystemInfoTemplate` är en platshållare – byt den mot den checklista supporten faktiskt vill ha
besvarad, så slipper alla komma ihåg vad som ska med.

## Endpoints

| Metod | Väg | Gör |
|---|---|---|
| `GET` | `/api/support/options` | Picklistor, områden, mallar – allt formuläret behöver i ett anrop |
| `POST` | `/api/support/bugs` | Skapar buggen |
| `GET` | `/api/support/bugs?from=&to=` | Supportens ärenden i ett datumintervall, med status, version och tolkade berörda |

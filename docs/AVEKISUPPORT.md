# AvekiSupport

Den andra ingången från startsidan. Tänkt för sällan-användare: supporten ska kunna skriva ett
användbart buggkort på ett par minuter och sedan följa det, utan att lära sig Azure DevOps
webbgränssnitt.

## Vad som händer när ett ärende skickas

Ett vanligt **Bug**-work item skapas i samma projekt som resten – det finns ingen separat lagring.

| Fält på kortet | Kommer från |
|---|---|
| `System.Title` | Rubrik |
| `Microsoft.VSTS.TCM.ReproSteps` | De fem beskrivningsfälten, hopslagna i mallens ordning |
| `Microsoft.VSTS.Common.Severity` | Allvarlighetsgrad (riktig picklista från processmallen) |
| `Custom.Source` | Källa |
| `Microsoft.VSTS.TCM.SystemInfo` | System Info |
| `Custom.Stakeholders` | Berörda, en `<div><b>Kategori:</b> Namn (notering)</div>` per rad |
| `System.AreaPath` | Område |
| `System.IterationPath` | `Support:BacklogIterationPath` – tom betyder projektets rot, dvs. PO:s backlogg |
| `System.Tags` | `Support:BugTag` (default `AvekiSupport`) |

Taggen är hur dashboarden hittar korten igen. **Byter du tagg försvinner de gamla ärendena ur
översikten** – de finns kvar i Azure, men verktyget söker på den nya taggen.

## Repro steps-mallen

Fem separata fält i stället för en textruta med rubriker i:

1. Kort beskrivning om buggen
2. Steg för att återskapa buggen
3. Förväntat resultat (innan bugg)
4. Faktiskt resultat (vid bugg)
5. Skärmbild(er)

De slås ihop till en text med rubrikerna i samma ordning varje gång. Rubriker skrivs ut även för
tomma fält – ett kort utan rubrik ser ut som att frågan glömdes bort, inte som att svaret var
"inget".

Varje fält är en `MarkdownEditor`, så en skärmdump kan klistras in direkt från urklipp (Ctrl+V) var
som helst i texten – precis som i Azure. Bilden laddas upp som en bilaga och länkas in.

Minimikravet för att kunna skicka är rubrik, ditt namn, och antingen en beskrivning eller steg.

## Berörda (stakeholders)

Läggs till en i taget: kategori (`Buggrapportör`, `Support`, `Intern`, `Kund`), namn och en valfri
notering (kontaktperson, ärendenummer, datum). Buggrapportören fylls i automatiskt från namnet
högst upp och går inte att ta bort.

Anledningen till att det inte är en fritextruta: fältet i Azure innehåller idag handskrivna rader i
ett dussin olika format, vilket gör det oanvändbart att söka i. Kategorierna definieras i
`SupportBugs.StakeholderCategories` på servern så att etiketten i formuläret och etiketten som
skrivs till Azure inte kan glida isär.

## Vem är du?

Det finns ingen inloggning än – Api:t kör på en delad PAT, så Azures `CreatedBy` säger samma namn
på varje kort. Därför skriver rapportören sitt namn själv (sparas i webbläsarens localStorage), och
det namnet hamnar på kortets Buggrapportör-rad. Det är också den raden "mina ärenden" filtrerar på.

Byt ut det mot Aveki ID-identiteten så fort inloggningen finns: resten av verktyget frågar bara
efter ett namn (`src/support/reporter.ts`).

## Flödet på dashboarden

| Steg | Betyder |
|---|---|
| Inkommen | Ligger i produktägarens backlogg (state `New`, ingen sprint) |
| Planerad | Inplanerad i en sprint (state `New`, iteration ≠ projektroten) |
| Under arbete | `Active` |
| Testas | `Resolved` |
| Klar | `Closed` |

Härleds i `SupportBugs.FlowStageFor` på servern, speglas av `FLOW_STAGES` i klienten. Klick på ett
kort öppnar samma work item-vy som Scrum-boarden använder, så supporten kan läsa diskussionen och
kommentera.

## Konfiguration

```json
"Support": {
  "BugTag": "AvekiSupport",
  "BacklogIterationPath": "",
  "DefaultAreaPath": "",
  "DefaultSeverity": "3 - Medium",
  "DefaultSource": "Customer",
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
| `GET` | `/api/support/bugs` | Alla ärenden med taggen, med flödessteg |

# Lokal utveckling

## Vanligt läge – ingen inloggning

```powershell
# Terminal 1
dotnet run --project AvekiScrum.Api

# Terminal 2
cd AvekiScrum.Client
npm run dev
```

API:t på `http://localhost:5273`, klienten på `http://localhost:5199`. `Auth:Mode` står på `"Pat"` i
`appsettings.json`, så inget kräver inloggning och Azure DevOps nås med `AzureDevOps__PAT`.

## Med inloggning – för att testa identiteten

Så här testar du att din egen inloggning fångas upp och att ditt namn automatiskt hamnar som
rapportör.

```powershell
# Terminal 1 - inloggning krävs, Azure DevOps går fortfarande via PAT
$env:Auth__Mode = "EntraWithPat"
dotnet run --project AvekiScrum.Api

# Terminal 2 - .env.development slår på MSAL i klienten
cd AvekiScrum.Client
npm run dev
```

**Ingen klienthemlighet behövs.** `EntraWithPat` validerar din token men gör ingen
on-behalf-of-växling, och det är bara växlingen som använder hemligheten. Först i `Entra`-läge
behöver du sätta `Auth__ClientSecret` – och det läget kräver dessutom admin consent, se
[BEGARAN_ADMIN_CONSENT.md](BEGARAN_ADMIN_CONSENT.md).

**Kontrollera att `http://localhost:5199/` finns som redirect-URI** på SPA-registreringen
(*Authentication* → Single-page application). Saknas den blir det `AADSTS50011` vid inloggning.

Porten är låst till 5199 i `vite.config.ts` just därför: MSAL skickar tillbaka webbläsaren till
`window.location.origin`, så en dev-server som glider vidare till nästa lediga port får ett
`AADSTS50011` som inte ser ut att ha med porten att göra. Är 5199 upptagen vägrar Vite starta i
stället för att byta – det felet är lättare att förstå.

Det du ska se:

1. Sidan laddar efter en kort paus – inloggningen sker tyst mot din Windows-session.
2. Ditt namn och din bild uppe till höger – redan på startsidan, innan du valt ingång.
3. AvekiSupport → *Nytt ärende*: ditt namn ifyllt och **skrivskyddat**, med texten "Hämtat från din
   inloggning".
4. Buggrapportör-raden under *Berörda (Stakeholders)* säger ditt namn.
5. *Area Path* förvald efter ditt team – `myCarta` för Nord, `Energi- och VA-banken` för Syd – med
   texten "Förvald för Team …" under. Teamet läses ur dina rollgrupper i `TeamRoleConfig`.
6. AvekiSupport → *Ärenden*: "Mina ärenden" hittar det du rapporterat.

Diagnostiken längst ned på startsidan visar vilket läge som gäller. I `EntraWithPat` misslyckas
kontrollen "Azure DevOps som dig" med flit – det är den som kräver consenten.

### Tillbaka till anonymt

Ta bort `$env:Auth__Mode` (eller starta en ny terminal) och kommentera bort `VITE_ENTRA_*`-raderna i
`AvekiScrum.Client/.env.development`. Klienten stänger av inloggningen av sig själv när client-id
saknas.

## Byta mellan sandlådan och skarpa projektet

`AzureDevOps:Project` i `appsettings.json` är det skarpa projektet (`Utveckling`).
`Testing:ProjectOverride` lägger sig över det när den är ifylld:

| `Testing:ProjectOverride` | Kör mot |
|---|---|
| `"ScrumLab"` | Sandlådan. Testkort du skapar hamnar där |
| `""` | `Utveckling` – riktiga kort, riktiga ändringar |

**Proceduren är två steg, och det andra är det som glöms:**

1. Ändra `Testing:ProjectOverride` i `AvekiScrum.Api/appsettings.json`.
2. **Starta om API:t.** Configen läses en gång vid start – en instans som redan kör fortsätter
   servera det projekt som gällde när den startade.

Steg 2 är lätt att missa eftersom sandlådan är en kopia av det skarpa projektet: samma area paths,
samma sprintnamn, samma utseende. Därför säger appen det själv numera:

- **Gul "Sandlåda: ScrumLab"-etikett uppe till höger** när överstyrningen är på. Ingen etikett
  betyder skarpt projekt.
- **Första raden i API-fönstret** namnger projektet vid start.
- **`/api/health`** svarar med `project` och `sandbox`.

Startar du via `start-local.bat` vägrar den numera köra om något redan lyssnar på 5273, i stället
för att låta en gammal instans svara vidare i det tysta. Den skriver ut vilken process det är och
hur du stoppar den.

`appsettings.Production.json` nollställer överstyrningen, så drift alltid går mot det riktiga
projektet oavsett vad som står lokalt.

## Auth:Mode

Tre giltiga värden: `"Entra"`, `"EntraWithPat"`, `"Pat"`. Namnen matchas exakt, och något annat
avbryter starten med ett felmeddelande – tidigare föll ett okänt värde tillbaka till `"Pat"`, som är
det enda läge där API:t är öppet för anonyma anrop. En felstavning stängde alltså av inloggningen
utan att någon märkte det.

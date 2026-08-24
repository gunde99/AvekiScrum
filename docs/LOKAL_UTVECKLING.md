# Lokal utveckling

Tre sätt att köra det här, och de ska inte gå i vägen för varandra. Skillnaden mellan dem är
**en enda inställning på servern** – `Auth:Mode`. Klienten frågar `/api/health` innan den gör något
annat och rättar sig efter svaret, så det finns ingenting att ställa om på klientsidan när du byter.

| | Startas med | `Auth:Mode` | Inloggning | Azure DevOps anropas som |
|---|---|---|---|---|
| **1. Bara PAT** – utan VPN, utanför intranätet | `start-pat.bat` | `Pat` | ingen | PAT-ägaren |
| **2. Inloggning lokalt** – på intranätet | `start-entra.bat` | `EntraWithPat` | ditt konto | PAT-ägaren |
| **3. Publicerad** – alla kommer åt den | IIS, se [DEPLOY_IIS.md](DEPLOY_IIS.md) | `Entra` | ditt konto | dig själv |

Byta läge: stäng båda fönstren och kör den andra bat-filen. Inget annat.

## 1. Bara PAT

```
start-pat.bat
```

API:t på `http://localhost:5273`, klienten på `http://localhost:5199`. Ingen inloggning alls –
klienten kör inte ens MSAL, eftersom servern har sagt att den inte behöver. Allt du skapar i Azure
DevOps skrivs som PAT-ägaren, och uppe till höger står **PAT-läge** så att det inte är en
överraskning.

Kräver bara miljövariabeln `AzureDevOps__PAT`. Det här är läget som fungerar även när du inte når
Entra.

## 2. Inloggning lokalt

```
start-entra.bat
```

Du loggar in med ditt eget konto, API:t avvisar anonyma anrop, och ditt namn hamnar som rapportör.
Azure DevOps nås fortfarande med den delade PAT-en – skillnaden mot läge 3 är bara vem Azures egen
historik pekar ut, och det kräver admin consent.

**Ingen klienthemlighet behövs.** `EntraWithPat` validerar din token men gör ingen
on-behalf-of-växling, och det är bara växlingen som använder hemligheten. Först i `Entra`-läge
behöver du sätta `Auth__ClientSecret` – se [BEGARAN_ADMIN_CONSENT.md](BEGARAN_ADMIN_CONSENT.md).

**Kontrollera att `http://localhost:5199/` finns som redirect-URI** på SPA-registreringen
(*Authentication* → Single-page application). Saknas den blir det `AADSTS50011`.

Porten är låst till 5199 i `vite.config.ts` just därför: MSAL skickar tillbaka webbläsaren till
`window.location.origin`, så en dev-server som glider vidare till nästa lediga port ger ett
`AADSTS50011` som inte ser ut att ha med porten att göra. Är 5199 upptagen vägrar Vite starta i
stället för att byta.

Det du ska se:

1. Sidan laddar efter en kort paus – inloggningen sker tyst mot din Windows-session.
2. Ditt namn och din bild uppe till höger – redan på startsidan, innan du valt ingång.
3. AvekiSupport → *Nytt ärende*: ditt namn ifyllt och **skrivskyddat**.
4. Buggrapportör-raden under *Berörda (Stakeholders)* säger ditt namn.
5. *Area Path* förvald efter ditt team – `myCarta` för Nord, `Energi- och VA-banken` för Syd.

Diagnostiken längst ned på startsidan visar vilket läge som gäller. I `EntraWithPat` misslyckas
kontrollen "Azure DevOps som dig" med flit – det är den som kräver consenten.

## 3. Publicerad på intranätet

Ligger på IIS och nås via webbadressen. `appsettings.Production.json` sätter läget; se
[DEPLOY_IIS.md](DEPLOY_IIS.md). Inget lokalt startas.

## Varför lägena inte krockar längre

Klienten brukade avgöra själv om den skulle logga in, utifrån om `VITE_ENTRA_*` fanns i bygget. Den
frågan hörde aldrig hemma där: servern är den som avvisar eller släpper in. Varje gång de två inte
var överens såg det ut som ett fel – ett ansikte som försvann, 401 på allt, eller en omdirigering
till Entra för ett API som gärna hade svarat anonymt.

Numera hämtar klienten `/api/health` först och gör som den säger. `.env.development` behöver alltså
aldrig röras när du byter läge; den anger bara vad klienten *kan*, inte vad den *ska*.

Går API:t inte att nå alls säger startsidan **"Servern svarar inte"** och pekar ut bat-filerna, i
stället för att blanda in inloggningen i ett fel som inte har med den att göra.

Bat-filerna vägrar dessutom starta om något redan lyssnar på 5273 eller 5199, och skriver ut vilken
process det är. En kvarglömd instans läser configen från när *den* startade – det är så man hamnar i
fel projekt eller fel läge utan att något säger till.

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

`appsettings.Production.json` nollställer överstyrningen, så drift alltid går mot det riktiga
projektet oavsett vad som står lokalt.

## Auth:Mode

Tre giltiga värden: `"Entra"`, `"EntraWithPat"`, `"Pat"`. Namnen matchas exakt, och något annat
avbryter starten med ett felmeddelande – tidigare föll ett okänt värde tillbaka till `"Pat"`, som är
det enda läge där API:t är öppet för anonyma anrop. En felstavning stängde alltså av inloggningen
utan att någon märkte det.

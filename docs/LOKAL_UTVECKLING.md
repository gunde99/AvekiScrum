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

Det du ska se:

1. Sidan laddar efter en kort paus – inloggningen sker tyst mot din Windows-session.
2. Ditt namn och din bild uppe till höger.
3. AvekiSupport → *Nytt ärende*: ditt namn ifyllt och **skrivskyddat**, med texten "Hämtat från din
   inloggning".
4. Buggrapportör-raden under *Berörda* säger ditt namn.
5. AvekiSupport → *Ärenden*: "Mina ärenden" hittar det du rapporterat.

Diagnostiken längst ned på startsidan visar vilket läge som gäller. I `EntraWithPat` misslyckas
kontrollen "Azure DevOps som dig" med flit – det är den som kräver consenten.

### Tillbaka till anonymt

Ta bort `$env:Auth__Mode` (eller starta en ny terminal) och kommentera bort `VITE_ENTRA_*`-raderna i
`AvekiScrum.Client/.env.development`. Klienten stänger av inloggningen av sig själv när client-id
saknas.

## Sandlådan

`appsettings.json` pekar mot **ScrumLab** via `Testing:ProjectOverride`, inte mot `Utveckling`.
Testkort du skapar lokalt hamnar alltså i sandlådan. `appsettings.Production.json` nollställer
överstyrningen, så drift går mot det riktiga projektet.

# Driftsättning på IIS

AvekiScrum publiceras som **en** IIS-site: API:t serverar också den byggda React-klienten från
`wwwroot`. Samma origin betyder ingen CORS i drift, ett certifikat i stället för två, och inget
andra värdnamn att hålla reda på.

Förutsätter att app-registreringarna är gjorda enligt [ENTRA_APP_REGISTRATIONS.md](ENTRA_APP_REGISTRATIONS.md).

## En gång, på servern

1. **.NET 8 Hosting Bundle** installerat (ASP.NET Core Module V2). Kontrollera med
   `dotnet --list-runtimes` – `Microsoft.AspNetCore.App 8.x` ska finnas.
2. **Site i IIS** på `scrum.aveki.se` med https-bindning och certifikat.
   - Applikationspool: **No Managed Code**, *Load User Profile* = `True`
     (MSAL:s tokencache och certifikathanteringen vill åt användarprofilen).
   - **Fysisk sökväg: publish-roten**, alltså mappen där `web.config` och `AvekiScrum.Api.dll`
     ligger – till exempel `C:\Applications\AvekiScrum\SPA`.

   > Peka **inte** siten mot `wwwroot`. Det är ASP.NET Core Module i `web.config` som startar
   > appen, och appen serverar sedan `wwwroot` själv. Med siten på `wwwroot` skulle `index.html`
   > visas men ingenting köra – och varje `/api`-anrop ge 404. Ingen extra IIS-application behövs
   > heller; en site räcker.
3. **Miljövariabler**, satta på maskinnivå så att app poolen ser dem:

```powershell
[Environment]::SetEnvironmentVariable("Auth__ClientSecret", "<hemligheten>", "Machine")
[Environment]::SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Production", "Machine")
```

   Variabeln heter `Auth__ClientSecret` – det är namnet Microsoft.Identity.Web läser.
   `Auth__ApiClientSecret` accepteras också, eftersom en tidigare version av det här dokumentet
   sa så, men använd det första i nya installationer.

   Starta om `W3SVC` efteråt – app poolen läser miljövariabler vid start.

   `AzureDevOps__PAT` behövs **inte** längre i Entra-läge. Låt den gärna ligga kvar tills
   driftsättningen är verifierad; den används bara om `Auth:Mode` sätts tillbaka till `Pat`.

## Publicera

Från utvecklingsmaskinen:

```powershell
# 1. Bygg klienten. .env.production ger client-id, tenant och scope - inget att sätta för hand.
cd AvekiScrum.Client
npm ci
npm run build          # → AvekiScrum.Client/dist

# 2. Kopiera in den i API:ts wwwroot
Remove-Item ..\AvekiScrum.Api\wwwroot -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item dist ..\AvekiScrum.Api\wwwroot -Recurse

# 3. Publicera API:t
cd ..
dotnet publish AvekiScrum.Api\AvekiScrum.Api.csproj -c Release -o .\publish
```

Kopiera `publish`-mappen till serverns site-rot. Stoppa app poolen först – annars är
`AvekiScrum.Api.dll` låst.

`appsettings.Production.json` slår på `Auth:Mode = "Entra"` och stänger av sandlåde-överstyrningen
mot ScrumLab, så skarp drift går mot `Utveckling`.

## Kontrollera efteråt

I den här ordningen – varje steg utesluter en felkälla:

0. **`https://scrum.aveki.se/api/health`** ska svara med JSON. Den kräver ingen inloggning och
   svarar även när allt annat är fel, så den skiljer "appen kör inte" från "inloggningen krånglar".
   Titta särskilt på `authMode` och `hasClientSecret` i svaret.
0b. **`https://scrum.aveki.se/api/health/azure`** (kräver inloggning) gör de två steg som kan
   fallera mellan "du är inloggad" och "boarden fungerar": växlingen on-behalf-of och första
   anropet till Azure DevOps. Den svarar med vad som gick fel i ord, så du slipper leta i loggen.
1. **`https://scrum.aveki.se/`** i Edge på en domänansluten maskin. Inloggningen ska ske utan att
   något visas. Uppe till höger ska ditt namn och din bild stå.
2. **`/api/me`** i samma flik ska svara `{"signedIn":true,...}` med ditt namn, och `matchedEmail`
   ifylld om du finns i TeamRoleConfig.
3. **Öppna Dailys-boarden.** Får du data har on-behalf-of-växlingen mot Azure DevOps fungerat.
4. **Skapa ett testärende i AvekiSupport** och öppna det i Azure DevOps. *Created by* ska vara du,
   inte PAT-ägaren. Det är hela poängen med övergången. Radera kortet efteråt.

## Om något inte fungerar

| Symptom | Trolig orsak |
|---|---|
| **Vit sida** | Appen startade men klienten kraschade – den visar numera ett felkort i stället, så en helt vit sida betyder oftast en gammal build i `wwwroot`. Publicera om. Svarar inte `/api/health` alls är det appen som inte kör: kolla Hosting Bundle, app poolens läge och Event Viewer. |
| `HTTP 500.19` eller `500.30` vid start | .NET 8 Hosting Bundle saknas, eller app poolen är inte **No Managed Code** |
| Sidan visar filträd eller 403.14 | Siten pekar mot `wwwroot` i stället för publish-roten |
| 401 på alla `/api`-anrop | `requestedAccessTokenVersion` är inte `2` i API-appens manifest, eller `Auth:Audience` stämmer inte med Application ID URI |
| Inloggningen loopar | Redirect-URI:n i SPA-registreringen matchar inte adressen exakt (glöm inte avslutande `/`) |
| `AADSTS65001` (consent) | Admin consent saknas på någon av apparna, eller `knownClientApplications` är inte satt |
| `AADSTS7000215` (invalid client secret) | Hemligheten har gått ut, eller miljövariabeln syns inte för app poolen – starta om W3SVC |
| Inloggning fungerar men Azure DevOps svarar 401/403 | Användaren saknar behörighet i Azure DevOps, eller något `vso.*`-scope saknas på API-appen |
| Bilder i kort visas inte | Bilagor hämtas med token och läggs som blob-URL:er; kolla att `/api/attachments/...` svarar 200 i nätverksfliken |

Serverfel svarar numera med orsaken i JSON-svaret, så det syns i webbläsaren och i klientens
felmeddelanden – du behöver sällan gå till loggen alls.

Behöver du ändå loggen: appstart-krascher hamnar i Event Viewer under *Application*. För
stdout-loggen räcker det inte att sätta `stdoutLogEnabled="true"` i `web.config` – **mappen
`logs` måste finnas och app poolens identitet ha skrivrätt på den**, annars skapas ingenting och
inget säger till. Skapa den för hand:

```powershell
New-Item -ItemType Directory C:\Applications\AvekiScrum\SPA\logs
icacls C:\Applications\AvekiScrum\SPA\logs /grant "IIS AppPool\<app-poolens-namn>:(OI)(CI)M"
```

## Vägen tillbaka

Sätt `Auth:Mode` till `"Pat"` i `appsettings.Production.json` och starta om app poolen. Då
används den delade PAT:en igen och API:t släpper in anonyma anrop – bara som nödutgång, inte som
ett läge att bli kvar i.

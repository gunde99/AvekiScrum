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
3. **Miljövariabler**, satta på maskinnivå så att app poolen ser dem:

```powershell
[Environment]::SetEnvironmentVariable("Auth__ApiClientSecret", "<hemligheten>", "Machine")
[Environment]::SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Production", "Machine")
```

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
| 401 på alla `/api`-anrop | `requestedAccessTokenVersion` är inte `2` i API-appens manifest, eller `Auth:Audience` stämmer inte med Application ID URI |
| Inloggningen loopar | Redirect-URI:n i SPA-registreringen matchar inte adressen exakt (glöm inte avslutande `/`) |
| `AADSTS65001` (consent) | Admin consent saknas på någon av apparna, eller `knownClientApplications` är inte satt |
| `AADSTS7000215` (invalid client secret) | Hemligheten har gått ut, eller miljövariabeln syns inte för app poolen – starta om W3SVC |
| Inloggning fungerar men Azure DevOps svarar 401/403 | Användaren saknar behörighet i Azure DevOps, eller något `vso.*`-scope saknas på API-appen |
| Bilder i kort visas inte | Bilagor hämtas med token och läggs som blob-URL:er; kolla att `/api/attachments/...` svarar 200 i nätverksfliken |

Loggar hamnar i Event Viewer under *Application* om appen kraschar vid start; annars i
stdout-loggen om du slår på `stdoutLogEnabled` i `web.config` tillfälligt.

## Vägen tillbaka

Sätt `Auth:Mode` till `"Pat"` i `appsettings.Production.json` och starta om app poolen. Då
används den delade PAT:en igen och API:t släpper in anonyma anrop – bara som nödutgång, inte som
ett läge att bli kvar i.

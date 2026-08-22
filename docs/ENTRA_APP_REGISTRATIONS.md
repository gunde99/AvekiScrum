# App-registreringar i Microsoft Entra

Steg för steg för att flytta AvekiScrum från en delad PAT till delegerad inloggning, så att korten
i Azure DevOps taggas med rätt person och API:t inte längre är öppet.

Två registreringar behövs:

| # | Namn | Typ | Roll |
|---|---|---|---|
| 1 | **AvekiScrum API** | Confidential client (webb-API) | Tar emot användarens token, växlar den on-behalf-of mot Azure DevOps |
| 2 | **AvekiScrum** | Single-page application | Loggar in användaren och hämtar en token för API:t |

Ordningen spelar roll: gör API:t först, för SPA:n ska peka på dess scope.

> Bakgrund: Azure DevOps OAuth (den gamla, egna varianten) tar inte emot nya registreringar sedan
> april 2025 och stängs av under 2026. Entra ID OAuth är den väg Microsoft pekar på, och det är den
> här beskrivningen följer.

---

## 1. AvekiScrum API

### 1.1 Registrera

Entra-portalen → **App registrations** → **New registration**.

- **Name**: `AvekiScrum API`
- **Supported account types**: *Accounts in this organizational directory only (Aveki – Single tenant)*
- **Redirect URI**: lämna tom (ett API tar inte emot redirects)

Efter **Register**, anteckna från *Overview*:

- **Application (client) ID** → blir `Auth:ApiClientId`
- **Directory (tenant) ID** → blir `Auth:TenantId`

### 1.2 Exponera scopet som SPA:n ska be om

**Expose an API** → **Add a scope**.

Första gången föreslås en Application ID URI: acceptera `api://<api-client-id>`.

Lägg sedan till scopet:

| Fält | Värde |
|---|---|
| Scope name | `access_as_user` |
| Who can consent | **Admins and users** |
| Admin consent display name | `Använd AvekiScrum som inloggad användare` |
| Admin consent description | `Låter AvekiScrum läsa och skriva i Azure DevOps som den inloggade användaren.` |
| User consent display name | `Använd AvekiScrum som dig själv` |
| User consent description | `Låter AvekiScrum arbeta i Azure DevOps i ditt namn.` |
| State | Enabled |

Fullständigt scope blir `api://<api-client-id>/access_as_user`. Det är strängen klienten ber om.

### 1.3 Behörigheter mot Azure DevOps

**API permissions** → **Add a permission** → fliken **APIs my organization uses** → sök på
`Azure DevOps` (resurs-id `499b84ac-1321-427f-aa17-267ca6975798`) → **Delegated permissions**.

Kryssa i, och inget mer:

| Scope | Varför vi behöver det |
|---|---|
| `vso.work_full` | Läsa och skriva buggar, tasks, taggar, bilagor – och radera (DoR-flödet lägger kort i papperskorgen) |
| `vso.project` | Läsa projekt, team och teaminställningar (sprintar) |
| `vso.wiki` | Sprintmålen läses ur wikin |
| `vso.code` | PR-fliken på korten |
| `vso.identity` | Slå upp identiteter, för namnmatchningen |
| `vso.profile` | "Vem är jag"-anropet |

Undvik `user_impersonation`. Det ger full åtkomst till hela Azure DevOps REST-API:t och är precis
den breda behörighet vi lämnar bakom oss tillsammans med PAT:en.

Klicka sedan **Grant admin consent for Aveki**, och kontrollera **Status**-kolumnen: varje
`vso.*`-rad ska visa "Beviljad för Aveki" med grön bock. Utan det nekas växlingen on-behalf-of med
`AADSTS65001` – felet nämner API-appens id, inte SPA:ns, vilket är ledtråden till vilken av de två
apparna som saknar consent.

> Två kolumner som lätt förväxlas: **"Administratörsmedgivande krävs"** säger bara om en vanlig
> användare *skulle få* godkänna behörigheten själv. Det är **Status** som visar vad som faktiskt
> är godkänt. Tom Status betyder att ingenting är godkänt, oavsett vad den första kolumnen säger.

Är knappen utgråad saknar du rollen som krävs – **Global Administrator**, **Privileged Role
Administrator** eller **Cloud Application Administrator**. Be någon av dem klicka, eller skicka
genvägs-URL:en nedan.

Och nej, användarna kan inte godkänna själva i det här upplägget, även om behörigheterna tillåter
det: SPA:n är förhandsgodkänd (steg 1.6), vilket gör att de aldrig får någon samtyckesdialog. Det
är avsiktligt – man vill inte att trettio personer var för sig ska ta ställning till en fråga som
hör hemma hos en administratör – men det betyder att admin consent är enda vägen.

Har du lagt till behörigheter *efter* att du gav consent måste du klicka igen; consent gäller det
som fanns när du klickade.

Genväg som ger tenant-wide consent direkt för API-appen:

```
https://login.microsoftonline.com/<tenant-id>/adminconsent?client_id=<api-client-id>
```

### 1.4 Klienthemlighet

**Certificates & secrets** → **New client secret**.

- Description: `AvekiScrum API – IIS`
- Expires: 24 månader (max). **Sätt en påminnelse i kalendern nu** – när den går ut slutar
  inloggningen fungera, och felmeddelandet säger inte varför.

Kopiera **Value** direkt (den visas bara en gång) och lägg den som miljövariabel på servern, aldrig
i appsettings.json:

```powershell
[Environment]::SetEnvironmentVariable("Auth__ClientSecret", "<hemligheten>", "Machine")
```

> Vill ni slippa förnyelsen kan ni använda ett certifikat i stället under samma flik. Det är
> säkrare men krångligare att rulla; en hemlighet med kalenderpåminnelse duger för det här.

### 1.5 Token-version

**Manifest** → hitta `api.requestedAccessTokenVersion` och sätt den till `2`:

```json
"api": {
    "requestedAccessTokenVersion": 2,
    ...
}
```

Står den kvar på `null` (= v1) kommer API:t att avvisa tokens som "invalid audience", eftersom
Microsoft.Identity.Web förväntar sig v2-tokens från `login.microsoftonline.com/<tenant>/v2.0`.

### 1.6 Låt SPA:n slippa en egen samtyckesdialog

Detta görs **efter** att SPA:n är registrerad (steg 2) – hoppa hit tillbaka då.

I API-appens **Manifest**:

```json
"knownClientApplications": ["<spa-client-id>"],
```

Och under **Expose an API** → **Add a client application**: klistra in SPA:ns client-id och kryssa i
`access_as_user`.

Det första gör att samtycket till API:ts Azure DevOps-behörigheter samlas in samtidigt som
användaren samtycker till SPA:n. Det andra gör att SPA:n är förhandsgodkänd och aldrig får någon
egen dialog.

---

## 2. AvekiScrum (SPA)

### 2.1 Registrera

**App registrations** → **New registration**.

- **Name**: `AvekiScrum`
- **Supported account types**: *Single tenant*
- **Redirect URI**: välj plattformen **Single-page application (SPA)** och ange
  `https://<intranät-värdnamn>/`

Anteckna **Application (client) ID** → blir `VITE_ENTRA_CLIENT_ID`.

> Välj verkligen plattformen *Single-page application*, inte *Web*. SPA-plattformen sätter upp
> auth code + PKCE med CORS-stöd på token-endpointen; *Web* förutsätter en klienthemlighet som en
> webbläsarapp inte kan hålla.

### 2.2 Fler redirect-URI:er

Under **Authentication** → *Single-page application* → **Add URI**:

- `https://<intranät-värdnamn>/` – produktion
- `http://localhost:5199/` – lokal utveckling med vite

WAM (steg 4) kräver https, så för att testa det lokalt behövs `https://localhost:5199/` och vite
startad med ett dev-certifikat. Vanlig tyst inloggning via webbläsarsessionen fungerar på http.

Lämna **Implicit grant**-kryssrutorna tomma. De behövs inte och ska inte användas.

Ingen klienthemlighet ska skapas för den här appen.

### 2.3 Behörighet mot vårt API

**API permissions** → **Add a permission** → fliken **My APIs** → `AvekiScrum API` →
**Delegated permissions** → `access_as_user` → **Add permissions**.

Sedan **Grant admin consent for Aveki**.

Efter det: gå tillbaka till **1.6** och koppla ihop apparna.

---

## 3. Vem som får komma in

Delegerad inloggning betyder att var och en ser exakt det de får se i Azure DevOps. Vill ni utöver
det begränsa *vilka* som ens kan logga in i verktyget:

**Enterprise applications** → `AvekiScrum` → **Properties** → **Assignment required?** = **Yes**.
Sedan **Users and groups** → tilldela den grupp som ska ha åtkomst.

Det är den enklaste spärren och den kräver ingen kod. Alternativet – app-roller och
`[Authorize(Roles=…)]` – lägger vi till om ni vill skilja på behörigheter *inuti* verktyget.

---

## 4. Tyst inloggning

Ingenting i registreringarna styr detta, men två saker på klientsidan avgör om användarna slipper
dialoger:

1. **Webbläsarsessionen.** På en Entra-ansluten maskin i Edge finns redan en session mot Entra, och
   `acquireTokenSilent` / `ssoSilent` går igenom utan att något visas.
2. **WAM (device bound tokens).** Sätts med `allowPlatformBroker: true` i MSAL-konfigurationen.
   Kräver https, Edge eller Chrome med tillägget *Windows Accounts* (1.0.5+), och arbets- eller
   skolkonto. Saknas något faller MSAL tillbaka på vanliga webbflöden av sig själv, så det kostar
   inget att slå på.

---

## 5. Det du skickar tillbaka till mig

```
Tenant ID:              <guid>
API client ID:          <guid>
Application ID URI:     api://<guid>
SPA client ID:          <guid>
Intranät-värdnamn:      https://...
```

Klienthemligheten ska **inte** delas – den läggs bara som miljövariabel på servern.

Konfigurationen blir sedan:

```json
"Auth": {
  // "Pat" behåller dagens beteende för lokal utveckling, "Entra" slår på delegerad inloggning.
  "Mode": "Entra",
  "TenantId": "<tenant-guid>",
  "ApiClientId": "<api-client-guid>"
}
```

med `Auth__ClientSecret` som miljövariabel (namnet Microsoft.Identity.Web läser), och i klienten:

```
VITE_ENTRA_TENANT_ID=<tenant-guid>
VITE_ENTRA_CLIENT_ID=<spa-client-guid>
VITE_API_SCOPE=api://<api-client-guid>/access_as_user
```

---

## 6. Innan ni river ut PAT:en

- **Kontrollera org-policyn.** Organization settings → Policies. Inställningen *Third-party
  application access via OAuth* gäller de gamla Azure DevOps OAuth-apparna, inte Entra-appar, men
  det kostar två minuter att verifiera att inget annat blockerar.
- **Azure DevOps-organisationen måste ligga i samma Entra-tenant** som användarna loggar in mot.
- **Conditional Access gäller nu också verktyget.** Kräver ni MFA för Azure DevOps kommer samma
  krav att slå igenom här – vilket är poängen, men värt att veta innan någon blir förvånad.
- **Behåll `Auth:Mode = "Pat"` lokalt** tills allt är verifierat i drift. Övergången ska inte vara
  en enkelriktad dörr.

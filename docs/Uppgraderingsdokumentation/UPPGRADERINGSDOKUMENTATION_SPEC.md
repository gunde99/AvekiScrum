# Uppgraderingsdokumentation – spec (utkast v0.2)

Ny flik i **AvekiDokumentation** (bredvid *Konsult* och *Dokumentatör*). Status: **utkast för dialog**.
Öppna frågor finns samlade i [§11](#11-öppna-frågor). Varje fråga har ett föreslaget svar som
gäller tills vi bestämt annat.

> **v0.2 (2026-10-14):** wikistrukturen finns nu som POC, och återföringen bygger på wikins eget
> git-repo i stället för egen lagring och egen merge. Se **[§0](#0-v02--wikistruktur-och-git-baserat-flöde)**.
> Den ersätter §3 (katalog), §6–§8 (granskning, versionering, datamodell) och delar av §9. Avsnitten
> står kvar nedan som bakgrund.

> ⚠️ **Demo-data som ska bort före skarp användning (2026-10-15):** kundlistan i *Ny uppgradering*
> är hårdkodad för demot, med Värnamo, Kungsbacka, Lerum, NSVA, Simrishamn och Aarhus Vand och en
> påhittad modulkombination per kund. Allt finns i
> `AvekiScrum.Client/src/documentation/upgrade/demoCustomers.ts` och används i `NewUpgradeForm.tsx`
> (sök på `DEMO_CUSTOMERS`). Ersätt med ett riktigt kundregister och kundens verkliga moduler (F5),
> och radera filen.

---

## 0. v0.2 – Wikistruktur och git-baserat flöde

### 0.1 Wikistrukturen (POC)

Skapad från Word-dokumenten för 2026.1 och 2026.2 under
[ScrumLab.wiki › … › Uppgradering › Labday POC](https://dev.azure.com/Aveki/ScrumLab/_wiki/wikis/ScrumLab.wiki/2028/Labday-POC):

```text
Labday POC                       startsida: principer, gemensamt för alla kunder
├─ VA-banken                     produkt
│  ├─ 2026.2                     release: inledning + sidtabell (sida, gäller)
│  │  ├─ Förberedelser           ← en sida per del/modul som ändrats i releasen
│  │  ├─ Desktop - Anpassning av filer
│  │  ├─ Desktop - Allmänna moment
│  │  ├─ Danmark
│  │  ├─ Utskick - ServiceAlert
│  │  ├─ Desktop - Installationstest
│  │  ├─ myCarta Composer
│  │  ├─ GO-appar                ← GO som helhet
│  │  ├─ Energi GO               ← appspecifikt, utbrutet
│  │  ├─ GO-appar - Installationstest
│  │  ├─ VA-trans
│  │  └─ Uppdatera Lime
│  └─ 2026.1                     (samma mönster, plus Ledningskollen, VASS, VA-banken GO, Invent GO)
└─ Mallar / Modulsida
```

Konventioner som appen kan läsa utan katalog i appsettings:

| Konvention | Betydelse för appen |
|---|---|
| Undersidor till produkten = **releaser** | Releaselistan. En ny release kräver ingen deploy. |
| Undersidor till releasen = **moduler/delar** | Kryssrutorna. **Sidnamnet är modulens identitet** mellan releaser (samma namn varje release). |
| Wikins sidordning (`.order`) = **arbetsordning** | Ordningen i det sammanslagna dokumentet. Dokumentatören drar om i sidträdet, och ordningen får skilja sig mellan releaser. Ersätter `Order` i appsettings. |
| Första raden `> **Gäller:** …` | "Alla kunder" = förkryssad och låst. Övriga visas med villkoret som hjälptext ("Danska kunder", "Kunder med VA-trans"). |
| `## Moment` → `### Syfte` / `### Instruktion` | Fast form, så rubriknivåerna kan flyttas ner vid sammanslagning. |

Hoppa över releaser (F8): välj "från/till". Sidorna tas release för release, äldst först.

### 0.2 Återföring = wikins git-repo, med vårt UI ovanpå

Projektwikin är git-repot `ScrumLab.wiki` (i produktion `<Projekt>.wiki`) med grenen `wikiMaster`.
Allt nedan är **verifierat i ScrumLab 2026-10-14** med ett skript som bara använder REST-API:t,
utan lokal git. Två grenar ändrade samma rad, A mergades rent och B fick en `editEdit`-konflikt som
löstes med en sammanslagen text via API:t och mergades sedan.

| Begrepp i appen | Git-motsvarighet (ADO REST) |
|---|---|
| **Utcheckning** | Gren `uppgradering/<kund>-<release>-<kortid>` från `wikiMaster` (`POST refs`). Basen = grenens startcommit, exakt för alla sidor på en gång. |
| **Spara** (i boarden eller via uppladdad fil) | En commit på grenen (`POST pushes`). Författare = inloggad konsult (OBO). **Revisionshistoriken är git-loggen**, så vi bygger ingen egen. |
| **Visa dokumentet** | Läs de valda sidorna från grenen (`GET items?versionDescriptor=<gren>`) och slå ihop dem i wikins ordning. |
| **Uppdatera från wikin** (rebase, §7) | PR `wikiMaster → gren`, eller Merges-API:t. Konflikter hanteras på samma sätt som nedan. |
| **Lämna in** | PR `gren → wikiMaster`. Om `mergeStatus = succeeded` slutförs den direkt (squash, grenen raderas). |
| **Konflikt** | `GET pullrequests/{id}/conflicts` ger bas, wiki och konsultens version per sida. Vårt UI visar dem sida vid sida, och konsulten redigerar fram resultatet. `PATCH conflicts/{id}` med `mergeType: userMerged`, `userMergedContent` (base64) och `resolutionStatus: resolved` följs av en ny merge och sedan slutförande. |
| **Avbryt utcheckning** | Radera grenen. |

Det här förenklar specen:

- **Ingen egen diff3, inga egna revisioner, ingen JSON med bas- och arbetskopior** (§7–§8). Kvar i
  AvekiScrum blir bara liten metadata per utcheckning: kund, release(r), moduler, gren och PR-id.
- **Ingen klassning generell/kundspecifik (F4 utgår).** Dokumenten är gemensamma för alla kunder.
  Kundspecifikt (servernamn med mera) ligger i kundens eget dokument vid sidan om. Det konsulten
  ändrar i grenen är per definition generellt, och konsulten sköter själv sin merge.
- **Granskning är valfri (F6).** Lägg inte grenpolicy på `wikiMaster`, eftersom det skulle stoppa
  vanliga redigeringar i wikins webbgränssnitt. Erbjud i stället "Begär granskning" i vårt UI, som
  sätter en reviewer på PR:en och väntar på godkännande innan den slutförs.
- **Filformatet (§5) står kvar** för nedladdning och uppladdning. Sektions-id = sidans sökväg, och
  huvudet bär grenens commit-id i stället för revisionsnummer. Är filen gjord på en äldre commit än
  grenens senaste läggs uppladdningen som en commit på den äldre commiten (temporär gren) och mergas
  in med samma konfliktvy.

Kvar att verifiera: PR-sidorna för det dolda wikirepot i ADO:s webbgränssnitt (det behövs inte,
eftersom vårt UI visar allt), och konsulternas rättigheter (Contribute, Create branch, Contribute
to pull requests på wikirepot – normalt ingår det i wikiredigeringsrätten).

---

## 1. Syfte

Två ärenden:

1. **Ta fram ett uppgraderingsdokument för en kund.** Konsulten väljer release och kryssar i kundens
   moduler. Appen slår ihop modulernas uppgraderingsdokument från wikin till ett dokument. Det visas
   som formaterad markdown i boarden och kan laddas ner som fil.
2. **Föra tillbaka ändringar under kontroll.** Under uppgraderingen ändrar konsulten i dokumentet,
   antingen i boarden eller i den nedladdade filen. Ändringarna ska granskas och sedan föras in i
   respektive grunddokument i wikin. Det ska finnas revisioner, och flera konsulter ska kunna ha
   dokument utcheckade samtidigt.

## 2. Går det att göra – och behöver något befintligt ändras?

**Ja, det går.** Nästan allt är nytt och läggs till utan att befintlig kod ändras, precis som
resten av AvekiDokumentation. Det som finns och kan återanvändas:

| Finns redan | Var | Användning |
|---|---|---|
| Wikiläsning/-skrivning med ETag/If-Match | `IAzureDevOpsWikiClient.GetPageAsync` / `UpsertPageAsync` | Hämta grunddokument och skriva tillbaka med optimistisk låsning |
| Sidhistorik per version | `GetPageAsync(..., int? version)` | Grund för revisioner (se §7) |
| Delegerad ADO-auth (Entra OBO) | `EntraCredentialProvider` | Wiki-commits står på den som godkände, inte på ett servicekonto |
| JSON-fillagring med semafor | `Infrastructure/Persistence/JsonFile*Repository` | Lagra utcheckningar (§8) |
| Markdown-rendering | `marked` i klienten | Visa dokumentet i boarden |
| Flikram | `DocumentationApp` + `AppShell` `nav` | Ny flik |

**Det som behöver ändras eller utökas (litet, additivt):**

- **Wikiklienten:** `UpsertPageAsync`/`GetPageAsync` behöver överlagringar för en wiki i ett *annat
  projekt* (bara `GetPageByIdAsync` har det i dag). Det behövs om uppgraderingsdokumenten ligger i
  `Dokumentation.wiki` och inte i `Utveckling.wiki`.
- **Wikiklienten:** lista undersidor rekursivt under en sökväg (för att hitta releaser och moduler),
  om inte `GetPageAsync` med `SubPages` redan räcker. Det behöver verifieras.
- **Bilder och bilagor:** wikisidor pekar på `/.attachments/...`, som kräver inloggning. Det behövs
  en proxyendpoint för att visa bilder i boarden. Se fråga F7 för exporten.
- **Wikin själv:** det här kräver mest arbete. Uppgraderingsdokumenten måste följa en **fast
  struktur** (§3) så att appen kan hitta dem. Hur de ser ut i dag vet jag inte (F1).

## 3. Konfiguration av releaser och moduler ("bakom kulisserna")

**Förslag: konvention i wikin + en liten katalog i appsettings.**

Wikistruktur (exempel):

```
/Uppgradering
   /2027.1
      /Ekonomi
      /Lön
      /Aveki ID
   /2027.2
      ...
```

- **Release** = undersida till rotsökvägen. Appen upptäcker releaser själv, så en ny release kräver
  ingen deploy.
- **Modul** = undersida till releasen. Om sidan har egna undersidor följer de med i ordning (F2).
- **Modulkatalog** i `appsettings.json` ger metadata som wikin inte kan bära bra:

```jsonc
"UpgradeDocumentation": {
  "Organization": "Aveki",
  "Project": "Dokumentation",
  "WikiIdentifier": "Dokumentation.wiki",
  "RootPath": "/Uppgradering",
  "DataDirectory": "App_Data/upgrade-checkouts",
  "Modules": [
    { "Key": "ekonomi", "Name": "Ekonomi",  "WikiPageName": "Ekonomi",  "Order": 10, "Always": false },
    { "Key": "bas",     "Name": "Grundinstallation", "WikiPageName": "Bas", "Order": 0, "Always": true }
  ],
  "Reviewers": [ "..." ]
}
```

  - `Order` styr ordningen i det sammanslagna dokumentet. Det är oftast viktigt (bas före moduler).
  - `Always` betyder att modulen alltid kommer med, till exempel gemensamma förberedelser.
  - En modul som finns i katalogen men saknar sida för vald release visas som *"ingen
    uppgraderingsinstruktion för den här releasen"* och kan inte väljas.
  - En sida som finns i wikin men inte i katalogen visas under *Övrigt* med sidnamnet som namn. Då
    försvinner inget tyst.

Alternativ: lägga katalogen på en `_manifest`-sida i wikin, så att dokumentatören ändrar den utan
deploy. Se F3.

## 4. Flöde 1 – Ta fram dokument (utcheckning)

### UI: fliken "Uppgradering"

Fliken har tre undervyer:

| Vy | Innehåll |
|---|---|
| **Ny uppgradering** | Kund (fritext, eller kundregister F5), release (dropdown), modulkryssrutor med "alltid med"-moduler förkryssade och låsta. Knappen **Skapa dokument**. |
| **Mina uppgraderingar** | Utcheckningar jag skapat, med status. Öppna en för att läsa, redigera, ladda ner, ladda upp eller lämna in. |
| **Granska ändringar** | För granskare: inlämnade ändringsförslag (§6). |

### Vad "Skapa dokument" gör

1. Hämtar varje vald moduls wikisida, med eventuella undersidor, och sparar **innehåll och
   versions-id (ETag/commit)** för varje sida. Det blir utcheckningens **bas**.
2. Skapar en **utcheckning** (§8) med id, kund, release, moduler, skapare, tid och bas per sektion.
3. Bygger det sammanslagna dokumentet: genererat huvud (kund, release, moduler, datum,
   utchecknings-id), innehållsförteckning och sedan en sektion per modul i `Order`-ordning.
4. Visar det formaterat i boarden. Rubrikerna i modulsidorna flyttas ner en nivå, så att varje
   modul blir `##` under dokumentets `#`.

### Visning och redigering i boarden

- Läsläge: renderad markdown via `marked`, med innehållsförteckning i sidomenyn.
- **Redigera** per modulsektion, inte hela dokumentet. Editorn visar markdown-källan bredvid en
  förhandsvisning. Markörerna (§5) visas aldrig i editorn och kan därför inte förstöras här.
- Sparar automatiskt till utcheckningens **arbetskopia** på servern. Varje sparning blir en
  revision (§7).

### Export

- **Ladda ner** ger `Uppgradering_<Kund>_<Release>_<utcheckningsid-kort>.md` i det strukturerade
  formatet (§5). Filen innehåller arbetskopians aktuella innehåll och dess revisionsnummer.
- Valfritt senare: PDF/HTML-export för kund, utan markörer, som är skrivskyddad och inte kan
  laddas upp igen (F10).

## 5. Filformat (det som ska kunna parsas igen)

**Princip: filen bär bara identiteter, servern bär sanningen.** Basinnehåll, versioner och vem som
checkat ut finns på servern. Markörerna säger bara *vilken utcheckning* och *vilken sektion* en text
hör till. Om någon ändrar ett versionsnummer i filen spelar det ingen roll, eftersom servern ignorerar det.

Markörerna är HTML-kommentarer. De **syns inte** när filen visas som markdown (VS Code-förhandsvisning,
ADO, Typora), men syns tydligt i en texteditor:

```markdown
<!-- AVEKI-UPPGRADERING:HUVUD format=1 utcheckning=7f3a9c2e revision=4 -->
<!-- ⛔ RADER SOM BÖRJAR MED "<!-- AVEKI" FÅR INTE ÄNDRAS, FLYTTAS ELLER TAS BORT.
     Skriv fritt MELLAN markörerna. Text utanför markörerna förs inte tillbaka till wikin. -->

# Uppgradering Kund AB – release 2027.1

> ⚠️ Detta dokument är utcheckat från AvekiScrum (utcheckning 7f3a9c2e).
> Ändringar mellan markörerna kan lämnas tillbaka till wikin via AvekiDokumentation → Uppgradering.
> Rör inte raderna som börjar med `<!-- AVEKI`.

Kund: Kund AB · Moduler: Grundinstallation, Ekonomi, Lön · Skapad 2026-10-11 av Miro C.

<!-- AVEKI-UPPGRADERING:SEKTION-START id=bas -->
## Grundinstallation
...wikiinnehåll, fritt redigerbart...
<!-- AVEKI-UPPGRADERING:SEKTION-SLUT id=bas -->

<!-- AVEKI-UPPGRADERING:SEKTION-START id=ekonomi -->
## Ekonomi
...
<!-- AVEKI-UPPGRADERING:SEKTION-SLUT id=ekonomi -->

<!-- AVEKI-UPPGRADERING:ANTECKNINGAR -->
## Kundspecifika anteckningar
Fritt område. Förs aldrig tillbaka till wikin men sparas på utcheckningen.
<!-- AVEKI-UPPGRADERING:SLUT -->
```

### Valideringsregler vid uppladdning (med radnummer i felmeddelandet)

- Huvudmarkören finns, `format` stöds och `utcheckning` finns och tillhör en aktiv utcheckning.
- Varje START har exakt en matchande SLUT, utan nästling och utan okända `id`.
- Saknas en sektion räknas den som **oförändrad**, inte som borttagen. Att ta bort ett helt
  modulavsnitt via fil är för riskabelt för att tolkas som en avsikt.
- Text mellan sektioner (utanför markörer) ignoreras, och användaren får en varning.
- Tolerant mot CRLF/LF, BOM, avslutande blanksteg och "smarta" citattecken i markörerna. Det
  vanligaste felet är att någon öppnar filen i Word och sparar om den.
- Om filens `revision` är lägre än arbetskopians har det gjorts ändringar i boarden efter
  nedladdningen. Då slås filen och arbetskopian ihop med 3-vägsmerge (bas = revisionen som laddades
  ner). Konflikter visas sida vid sida.

## 6. Flöde 2 – Lämna tillbaka ändringar till wikin

### Steg

1. **Konsulten lämnar in** utcheckningen (*Lämna in ändringar*). Varje sektion där arbetskopian
   skiljer sig från basen blir ett **ändringsförslag**. Per ändringsblock (hunk) markerar konsulten:
   - **Generell**: ska in i grunddokumentet.
   - **Kundspecifik**: stannar i kundens dokument (servernamn, kundens avvikelser och liknande).
   Standard är *Generell* (F4). Konsulten kan skriva en kommentar per förslag ("steg 4 saknade
   omstart av tjänsten").
2. **Granskaren** (dokumentatör eller modulansvarig, F6) ser diffen per sektion: *bas → konsultens
   version* och, om wikin har ändrats sedan utcheckningen, *bas → wikins nuvarande version*.
   Granskaren godkänner, avvisar eller redigerar per hunk.
3. **Tillämpning:** 3-vägsmerge mellan bas, nuvarande wikiinnehåll och godkända hunkar. Resultatet
   skrivs med `UpsertPageAsync(..., expectedETag: <nuvarande>)` och commit-kommentaren
   `Uppgradering <Kund> (utcheckning 7f3a9c2e) – förslag av <konsult>, godkänt av <granskare>`.
4. Om ETag inte stämmer (någon skrev mellan steg 2 och 3) görs ny merge. Om den går rent skrivs
   resultatet direkt, annars får granskaren se det igen.
5. Sektionsstatus: *Oförändrad · Inlämnad · Godkänd · Delvis godkänd · Avvisad · Införd*.
   Utcheckningsstatus härleds från sektionerna.

### Varför granskning och inte direktskrivning?

Wikin är källan för alla kommande uppgraderingar. Ett kundspecifikt servernamn som av misstag
hamnar i grunddokumentet sprids till alla kunder. Granskningssteget är det som gör flödet
*kontrollerat*. Om man vill kan granskning vara frivillig för vissa personer (F6).

## 7. Versionering och samtidiga utcheckningar

**Modell: optimistisk, inga lås.** En uppgradering kan pågå i veckor. Lås skulle hindra andra
konsulter från att ens läsa ut ett aktuellt dokument.

- **Grunddokumentens revisioner** = wikins egen git-historik. Vi bygger ingen egen. Varje införd
  ändring blir en wiki-commit med spårbar kommentar som pekar på utcheckningen.
- **Utcheckningens revisioner** = arbetskopians historik i AvekiScrum (revision 1 = bas, sedan
  en ny för varje sparning, uppladdning och granskningsbeslut), med vem och när. Det ger "vad
  ändrade konsulten, och när" även innan något når wikin.
- **Samtidighet:** konsulterna A och B checkar ut Ekonomi 2027.1, båda med bas v12. A:s ändring förs
  in, så wikin blir v13. När B:s förslag granskas görs 3-vägsmerge mellan bas v12, wiki v13 och B.
  - Olika ställen ger ren merge och syns som "slås ihop automatiskt".
  - Samma ställe ger konflikt och visas för granskaren med alla tre versionerna. Granskaren väljer
    eller redigerar.
  - Samma ändring (båda lade till samma steg) upptäcks och läggs inte in två gånger.
- **Synlighet:** när man öppnar en utcheckning visas *"3 av dina moduler har uppdaterats i wikin
  sedan du checkade ut – Uppdatera"*. Då görs en rebase, alltså en merge av wikins ändringar in i
  arbetskopian, så att konsulten jobbar mot det senaste.
- **Översikt:** granskaren ser per wikisida vilka öppna utcheckningar som har inlämnade eller
  pågående ändringar mot den.

Diff/merge: radbaserad diff3 på serversidan (DiffPlex för diffar, merge-logiken skriver vi själva
eller tar från ett bibliotek). Det beslutas vid implementation. Markdown är radorienterat, så
radnivå räcker.

### Alternativ som övervägts: git-grenar och pull requests i ADO

> **v0.2: det här är nu valt, se §0.2.** Antagandet att konflikter kräver lokal git stämde inte. PR-konflikter går att lösa helt via REST (`pullrequests/{id}/conflicts`). Det är verifierat i ScrumLab.

Projektwikin är ett git-repo. Varje utcheckning skulle kunna vara en gren och varje inlämning en PR,
så att ADO sköter merge, granskning och historik. **Inte förstahandsval:** konflikthantering i ADO
PR kräver lokal git eller ett tillägg, vilket konsulterna inte har, och det är osäkert om
projektwikins repo tillåter grenar och PR:ar fullt ut. Värt att ompröva om wikin är en
*kod-wiki* (publicerad från ett vanligt repo).

## 8. Datamodell (lagring)

En JSON-fil per utcheckning under `UpgradeDocumentation:DataDirectory`, enligt mönstret i
`JsonFileTalkingPointRepository` men med **en fil per utcheckning** (de innehåller hela dokument
och växer). Det behövs en semafor per fil.

```text
UpgradeCheckout
  Id, Customer, Release, CreatedBy{email,name}, CreatedAt, Status
  Sections[]:
    Key (modul), Title, WikiPath, BaseVersion (ETag/commit), BaseContent,
    WorkingContent, Status, Proposal? { Hunks[{range, classification, decision, comment}] }
  CustomerNotes (markdown)
  Revisions[]: { No, At, By, Kind (Skapad|Redigerad|Uppladdad|Inlämnad|Granskad|Införd|Rebase),
                 SectionKey?, ContentSnapshot | Diff }
```

Om volymen blir stor (hundratals utcheckningar per år med hela dokument) kan det vara rätt att byta
till SQLite. Gränssnittet `IUpgradeCheckoutRepository` gör bytet lokalt.

## 9. API (minimal-API i `Program.cs`, samma stil som `/api/documentation/...`)

| Metod | Sökväg | Syfte |
|---|---|---|
| GET | `/api/documentation/upgrade/releases` | Releaser från wikin |
| GET | `/api/documentation/upgrade/releases/{release}/modules` | Katalog plus finns/saknas per release |
| POST | `/api/documentation/upgrade/checkouts` | Skapa utcheckning (kund, release, moduler) |
| GET | `/api/documentation/upgrade/checkouts?scope=mine\|all` | Lista |
| GET | `/api/documentation/upgrade/checkouts/{id}` | Hämta, inklusive "wikin har ändrats sedan bas" |
| PUT | `/api/documentation/upgrade/checkouts/{id}/sections/{key}` | Spara redigering (med `expectedRevision`) |
| GET | `/api/documentation/upgrade/checkouts/{id}/export` | Ladda ner .md |
| POST | `/api/documentation/upgrade/checkouts/{id}/import` | Ladda upp .md (validering enligt §5, svar = diff/konflikter) |
| POST | `/api/documentation/upgrade/checkouts/{id}/rebase` | Hämta in wikins nya ändringar |
| POST | `/api/documentation/upgrade/checkouts/{id}/submit` | Lämna in |
| GET | `/api/documentation/upgrade/proposals` | Granskningskö |
| POST | `/api/documentation/upgrade/proposals/{checkoutId}/{key}/decide` | Godkänn/avvisa hunkar och skriv till wikin |
| GET | `/api/documentation/upgrade/attachments?path=` | Bildproxy |

Parser, serialisering och merge ligger i `AvekiScrum.Application` som rena, testbara klasser, med
enhetstester för rundtur (serialisera → parsa → identiskt), trasiga markörer, CRLF/BOM, Word-citattecken
och merge-scenarierna i §7.

## 10. Leveransordning

1. **Läsflöde:** konfiguration, releaser och moduler, skapa utcheckning, visa i boarden, ladda ner.
   Det ger värde direkt, även innan återföringen finns.
2. **Redigering i boarden** och arbetskopia med revisioner.
3. **Uppladdning:** parser, validering och import.
4. **Återföring:** inlämning, granskning och skrivning till wikin (ingen samtidighet än, ETag-fel
   ger bara "försök igen").
5. **Samtidighet:** 3-vägsmerge, rebase och konfliktvy.

## 11. Öppna frågor

Föreslaget svar inom hakparentes. Det gäller tills vi bestämt annat.

- **F1. Hur ser wikin ut i dag?** Vilken wiki och sökväg, en sida per modul och release eller
  något annat? Behöver den struktureras om? *[Vi har ingen WIKi utan det ligger i worddokument. Skapa ett förslag på lämplig wiki-struktur under https://dev.azure.com/Aveki/ScrumLab/_wiki/wikis/ScrumLab.wiki/2028/Labday-POC → v0.2: skapat, se §0.1.]*
- **F2. Har en modul undersidor** som ska med? *[Strukturen i Wikin ska styra vilka versioner och vilka moduler som ska listas, så det är lämpligt att ha en undersida per modul. Det är inte alla moduler som ändras vid varje release]*
- **F3. Var ska modulkatalogen ligga:** appsettings (kräver deploy) eller en manifestsida i wikin
  (dokumentatören ändrar själv)? *[v0.2: ingen katalog. Wikins sidträd, sidordning och Gäller-rad
  räcker, se §0.1.]*
- **F4. Kundspecifikt kontra generellt:** ska konsulten klassa varje ändring, eller räcker
  granskarens bedömning? *[v0.2: utgår. Dokumenten är gemensamma, och kundspecifikt ligger i kundens
  eget dokument.]*
- **F5. Kund:** fritext eller koppling till ett kundregister, till exempel AvekiSupport, och ska
  kundens modulval sparas till nästa gång? *[Fritext, men kom ihåg kundens senaste modulval.]*
  *Just nu (demo): hårdkodad kundlista med påhittade moduler i `demoCustomers.ts` – ska bort, se
  varningen överst.*
- **F6. Vem granskar?** Dokumentatörerna (`TeamRoleConfig.TechnicalWriter`), en ansvarig per
  modul, eller får vissa skriva direkt? *[TechnicalWriter, och en modulansvarig kan läggas till per
  modul senare.]*
- **F7. Bilder i nedladdad fil:** absoluta länkar till ADO (kräver inloggning), inbäddade som
  base64 (stor fil) eller en zip med bilder? *[Absoluta ADO-länkar i v1.]*
- **F8. Hoppa över releaser:** när en kund går från 2026.3 till 2027.2, ska dokumenten för
  mellanliggande releaser slås ihop i ordning? *[Ja, det är troligen vanligt. Väljs som "från/till"
  i stället för en release, och sektionerna grupperas per release.]*
- **F9. Ändring hittad vid uppgradering till 2027.1:** ska den bara in i 2027.1-sidan, eller även
  föreslås för senare releaser som har samma avsnitt? *[Bara 2027.1. Granskaren får en påminnelse
  om att senare releaser finns.]*
- **F10. Behövs en kundversion** (PDF utan markörer)? *[Senare.]*
- **F11. Livslängd:** när arkiveras eller rensas utcheckningar? *[Arkiveras 90 dagar efter
  "Införd" eller "Avbruten" och raderas aldrig automatiskt.]*
- **F12. Behörighet:** ska alla som kan logga in i AvekiScrum se fliken, eller bara en grupp?
  *[Alla inloggade kan läsa och checka ut, och granskare skriver till wikin.]*

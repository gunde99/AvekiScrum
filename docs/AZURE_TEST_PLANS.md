# Azure DevOps Test Plans i WorkOrganizer och AvekiScrum

Den här guiden beskriver Azure DevOps Test Plans, hur informationen hänger ihop och den gemensamma integration som finns i WorkOrganizer och AvekiScrum.

## Vad Test Plans lagrar

Azure DevOps delar testhanteringen i flera resurser:

| Resurs | Betydelse | Lagring/API |
|---|---|---|
| Testplan | Ett avgränsat testarbete, ofta för en sprint eller release | Test Plan API |
| Testsvit | Struktur under en plan. Kan vara statisk, kravbaserad eller frågebaserad | Test Plan API |
| Testfall | Återanvändbart work item med titel, status, prioritet och teststeg | Work Item Tracking API |
| Testkonfiguration | Exempelvis webbläsare, operativsystem eller miljö | Test Plan API |
| Testpunkt | Den körbara kombinationen testfall + svit + konfiguration + testare | Test Plan API |
| Testkörning | Behållare för en eller flera körningar av testpunkter | Test API |
| Testresultat | Utfallet för ett testfall i en testkörning | Test API |

Ett testfall kan ligga i flera planer och sviter utan att kopieras. Att lägga ett testfall i en svit skapar en testpunkt per vald konfiguration. Resultatet som visas på testpunkten är det senaste utfallet, medan körningar och resultat är historiken. Microsoft beskriver samma objektrelationer i [Test objects and terms](https://learn.microsoft.com/en-us/azure/devops/test/test-objects-overview?view=azure-devops).

Sviterna har tre former:

- **Statisk svit**: en manuellt vald lista av testfall. Apparnas första vy skapar denna typ.
- **Kravbaserad svit**: knuten till ett krav, till exempel User Story eller Product Backlog Item, och ger spårbarhet mellan krav och test.
- **Frågebaserad svit**: fylls från en WIQL-fråga över testfall.

## Arbetsflöde i apparna

1. Välj eller skapa en testplan. Planen får Area Path och Iteration Path från Azure-projektet.
2. Välj eller skapa en statisk testsvit. Varje plan har en automatiskt skapad rotsvit.
3. Skapa ett testfall med titel och steg eller öppna ett befintligt testfall.
4. Lägg testfallet i sviten. Azure skapar testpunkter för svitens konfigurationer.
5. Markera testpunkter och skapa en testkörning.
6. Sätt `Passed`, `Failed`, `Blocked` eller `NotApplicable`, skriv vid behov en kommentar och slutför körningen.

I **AvekiScrum** öppnas Test Plans från den fristående **AvekiTest**-ingången på startsidan. Scrum-appens **Test**-flik visar i stället teamets Tasks med Activity **Testing**, grupperade efter arbetsstatus.

I **WorkOrganizer** finns **Scrum → Test Plans**. Desktopvyn har samma plan/svit/testfallsstruktur och ett kort körflöde där valt testfall markeras godkänt, underkänt eller blockerat.

`Area Path` styr även behörigheterna. Ange en befintlig sökväg exakt som den visas i Azure DevOps. `Iteration Path` anger var planen och de nya testfallen hör hemma; den flyttar inte sprintens övriga work items.

## Arkitektur

Båda lösningarna har samma kontrakt och DTO:er i Application-lagret:

- `ITestPlansService` är det användningsnära läs/skrivkontraktet.
- `TestPlanModels.cs` innehåller transportmodeller för planer, sviter, testfall, steg, konfigurationer, testpunkter, körningar och resultat.
- `AzureTestPlansService` kapslar Azure-URL:er, paginering, JSON-mappning, teststegs-XML och skrivoperationer.
- Den befintliga `AzureDevOpsRestClient` återanvänds. Därmed används samma projektval, loggning och autentisering som för Boards, Git och Wiki.

WorkOrganizer kopplar tjänsten direkt till WinForms via DI. AvekiScrum lägger ett projektspecifikt HTTP-API mellan React och tjänsten:

| Metod | Sökväg | Funktion |
|---|---|---|
| GET/POST/PATCH | `/api/test-plans` | Lista, skapa och ändra planer |
| GET/POST/PATCH | `/api/test-plans/{planId}/suites` | Lista, skapa och ändra sviter |
| GET/POST/DELETE | `/api/test-plans/{planId}/suites/{suiteId}/cases` | Hantera medlemskap i sviten |
| GET/PATCH | `/api/test-plans/{planId}/suites/{suiteId}/points` | Läsa testpunkter och tilldela testare |
| GET/POST/PATCH | `/api/test-plans/cases` | Läsa, skapa och ändra testfalls-work-items |
| GET/POST/PATCH | `/api/test-plans/configurations` | Läsa, skapa och ändra konfigurationer |
| GET/POST/PATCH | `/api/test-plans/runs` | Skapa/läsa körningar och spara resultat |

API:t är avsiktligt projektbegränsat. Projektet kommer från `AzureDevOps:Project`, eller från AvekiScrums `Testing:ProjectOverride` i en lokal sandlåda. Klienten kan inte skicka organisation eller projekt i anropet.

## Autentisering och hemligheter

WorkOrganizer använder PAT från miljövariabeln `AzureDevOps__PAT`. AvekiScrum använder samma PAT i `Pat` och `EntraWithPat`, och den inloggade användarens delegerade token i `Entra`. Ingen token sparas i klienten eller i Test Plans-data.

En PAT behöver minst **Test Management: Read & write** och **Work Items: Read & write**. Work Item-behörigheten behövs eftersom testfall är work items. Ge bara fler scopes om andra delar av appen kräver dem.

AvekiScrums Entra-registrering behöver de delegerade Azure DevOps-scopen `vso.test_write` och `vso.work_full`. `vso.test_write` ger läsning och skrivning av testartefakter enligt Microsofts [REST-dokumentation för testkörningar](https://learn.microsoft.com/en-us/rest/api/azure/devops/test/runs/create?view=azure-devops-rest-7.1). Efter att `vso.test_write` lagts till måste en administratör ge consent på nytt. Se `ENTRA_APP_REGISTRATIONS.md` i AvekiScrum.

## Licens och Azure-behörigheter

Full hantering i Azure Test Plans-portalen kräver normalt **Basic + Test Plans** eller en berättigad Visual Studio-prenumeration. Basic-användare kan köra tester och se resultat, medan skapande och administration av planer, sviter och testfall kräver Test Plans-access. Se [Microsofts tabell över accessnivåer](https://learn.microsoft.com/en-us/azure/devops/test/manual-test-permissions?view=azure-devops).

Utöver licensen behöver identiteten:

- `View work items in this node` för läsning.
- `Edit work items in this node`, `Manage test plans` och `Manage test suites` på aktuell Area Path för skrivning.
- `View test runs` och `Create test runs` på projektnivå för körflödet.
- `Manage test configurations` för att skapa eller ändra konfigurationer.

Azure returnerar 401 vid saknad eller utgången identitet, 403 vid otillräcklig access/behörighet och 400 när exempelvis Area Path, Iteration Path, tillstånd eller svittyp inte passar projektets process.

## REST-API:er och skrivordning

Integrationen använder Azure DevOps REST API 7.1:

- [Test Plans](https://learn.microsoft.com/en-us/rest/api/azure/devops/testplan/test-plans?view=azure-devops-rest-7.1)
- [Test Suites](https://learn.microsoft.com/en-us/rest/api/azure/devops/testplan/test-suites?view=azure-devops-rest-7.1)
- [Suite Test Case](https://learn.microsoft.com/en-us/rest/api/azure/devops/testplan/suite-test-case?view=azure-devops-rest-7.1)
- [Test Points](https://learn.microsoft.com/en-us/rest/api/azure/devops/test/points/list?view=azure-devops-rest-7.1)
- [Configurations](https://learn.microsoft.com/en-us/rest/api/azure/devops/testplan/configurations?view=azure-devops-rest-7.1)
- [Test Runs](https://learn.microsoft.com/en-us/rest/api/azure/devops/test/runs?view=azure-devops-rest-7.1)
- [Test Results](https://learn.microsoft.com/en-us/rest/api/azure/devops/test/results/update?view=azure-devops-rest-7.1)
- Work Item Tracking för Test Case: `GET/POST/PATCH _apis/wit/workitems`

Ett manuellt resultat sparas i tre steg: skapa körningen med testpunkt-ID:n, uppdatera resultatposterna som Azure skapade i körningen och sätt körningen till `Completed`. Att enbart ändra testpunktens senaste utfall ger inte samma revisions- och körhistorik och används därför inte för körflödet.

Plan-, svit- och testfallsmodellerna bär `revision`. Vid testfallsuppdatering skickas revisionen som JSON Patch `test /rev`, så en samtidig ändring i Azure ger konflikt i stället för att skrivas över tyst.

## Avgränsningar i första versionen

- UI:t skapar statiska sviter. Infrastrukturens modell stödjer även `requirementId` och `queryString` för kommande krav- och frågebaserade flöden.
- Vanliga manuella Action Steps kan läsas och skrivas. Ett testfall som innehåller Azure-komponenten **Shared Steps** blockeras vid redigering i appen för att inte tappa komponentreferensen; öppna det i Azure DevOps tills en särskild Shared Steps-editor finns.
- Datadrivna Shared Parameters, bilagor per steg, testkonfigurationsvariabler och exploratory testing har ännu ingen appvy. Grundtjänsten för testkonfigurationer finns.
- Borttagning av planer, sviter, testfall, körningar och konfigurationer exponeras inte i appvyerna. Det minskar risken för oavsiktlig förlust av delad testdata.
- Körvyn sparar utfall och kommentar. Det underliggande kontraktet kan även länka befintliga Bug-ID:n och sätta failure type.

## Felsökning

1. Kontrollera `/api/health/azure` i AvekiScrum eller en vanlig Azure-funktion i WorkOrganizer.
2. Kontrollera effektivt projekt. AvekiScrum skriver projekt och eventuell sandlådeoverride i startloggen.
3. Vid 401: kontrollera PAT/token, Entra consent och att processen har startats om efter miljövariabeländring.
4. Vid 403: kontrollera accessnivå, projekträttigheter och Area Path-behörigheter.
5. Om ett nytt testfall inte får en körbar testpunkt: kontrollera att sviten har en aktiv standardkonfiguration och lägg testfallet i sviten igen.
6. Vid konflikt: ladda om testfallet. Någon har sparat en nyare revision i Azure.


## AvekiTest

Startsidan har en fristående ingång till AvekiTest. Den använder Test Plans-API:t för ett
releaseorienterat arbetsflöde:

1. Release härleds i första hand ur testplanens namn (till exempel `2027.1`) och i andra hand ur
   iterationssökvägen. Planer utan release visas under **Testbibliotek**.
2. Testaren väljer plan och svit och ser prioritet, konfiguration, tilldelad testare och senaste
   resultat för varje testpunkt. Grundfiltret är prioritet 1–2.
3. **Kör valda** öppnar en separat körvy. Den visar den revision av teststegen som hör till
   testresultatet, inklusive expanderade Shared Steps.
4. Resultat sparas både för testfallet och för varje steg. Körningen slutförs först när alla valda
   resultat har sparats.

Körvyns URL uppdateras med `runId` direkt när Azure DevOps har skapat körningen. Den kan därför
läsas in på nytt utan att skapa en dubblett. Formaterad text saneras mot en begränsad lista av
HTML-element innan den visas.

### Begränsningar

Parameteriserade testfall visas med en tydlig varning eftersom parameterraderna ännu inte kan
väljas i AvekiTest. Testfallet länkar till Azure DevOps för den kontrollen. Skärmbilder,
videoinspelning och skapande av buggar under körningen ligger fortsatt i Microsoft Test Runner.

Användare behöver minst Azure DevOps **Basic** för att köra och registrera resultat. Att skapa och
administrera planer, sviter, testfall och konfigurationer kräver **Basic + Test Plans**. Entra-läget
kräver delegerad scope `vso.test_write`; PAT-läget kräver motsvarande Test Management-rättighet.

# Begäran om admin consent

Att skicka till någon med **Global Administrator**, **Privileged Role Administrator** eller
**Cloud Application Administrator** i Aveki-tenanten. Klipp och klistra.

---

**Ämne:** Admin consent för AvekiScrum API (5 minuter i Entra-portalen)

Hej!

Jag har byggt ett internt verktyg – AvekiScrum – som våra team och vår support använder i stället
för Azure DevOps webbgränssnitt. Det är driftsatt på `https://scrum.aveki.se` på vårt intranät.

För att verktyget ska kunna arbeta i Azure DevOps **som den inloggade användaren** behöver
app-registreringen `AvekiScrum API` admin consent. Utan det nekas anropen med `AADSTS65001`.

**Det jag behöver att du gör:**

1. Entra-portalen → **App registrations** → **AvekiScrum API**
   (Application ID `36cb84e8-d1c9-4ddf-9c19-1712645da02b`)
2. **API permissions** → **Bevilja administratörsgodkännande för Aveki**
3. Kontrollera att Status-kolumnen visar "Beviljad för Aveki" på varje rad

Eller direkt via länken, som gör samma sak:

```
https://login.microsoftonline.com/48e7c764-137b-4c2b-8521-8e0e1f19f10b/adminconsent?client_id=36cb84e8-d1c9-4ddf-9c19-1712645da02b
```

**Vad du godkänner:** delegerade behörigheter mot Azure DevOps – `vso.work_full`, `vso.project`,
`vso.wiki`, `vso.wiki_write`, `vso.code`, `vso.identity`, `vso.profile`, samt `User.Read` mot Graph.

**Delegerade** betyder att appen aldrig kan mer än den inloggade användaren redan får göra själv –
den agerar i användarens namn, inte i sitt eget. Ingen behörighet gäller appen som sådan.

Jag har medvetet valt bort `user_impersonation`, som hade gett full åtkomst till hela Azure DevOps
REST-API:t. De sju scopen ovan är precis vad verktyget använder och inget mer.

**Varför det är värt det:** i dag går verktyget mot Azure DevOps via en delad PAT, vilket betyder
att varje ändring registreras som PAT-ägaren oavsett vem som faktiskt gjorde den. Med consenten på
plats står rätt person på varje kort, och den delade token kan tas bort helt.

Tack!

---

## Under tiden

Verktyget kör med `Auth:Mode = "EntraWithPat"`: alla loggar in med sina egna konton och API:t är
stängt för anonyma anrop, men själva Azure DevOps-anropen går fortfarande via den delade PAT:en.
Allt fungerar – det enda som saknas är rätt namn i Azures egen ändringshistorik.

När consenten är klar: ändra `Auth:Mode` till `"Entra"` i `appsettings.Production.json`, starta om
app poolen, och kör diagnostiken. Det är hela bytet.

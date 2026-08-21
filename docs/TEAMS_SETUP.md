# Publicera sprintreview-rapporten till Teams

Review-boarden kan skicka rapporten "det här ska demas / prata om / förmedla i skrift" direkt till
en Teams-kanal. Det kräver en sak i Teams och en rad i `appsettings.json`.

## 1. Skapa ett arbetsflöde i Teams (en gång per kanal)

De gamla "Incoming Webhook"-connectorerna i Teams är utfasade av Microsoft. Ersättaren heter
**Workflows** (Power Automate) och gör precis samma sak: ger dig en URL som tar emot en HTTP POST
och lägger upp innehållet i kanalen.

1. Öppna Teams och gå till kanalen som rapporten ska hamna i (t.ex. *Team Syd → Allmänt*).
2. Klicka på **…** bredvid kanalnamnet → **Arbetsflöden** (*Workflows*).
3. Sök upp mallen **"Post to a channel when a webhook request is received"** och välj den.
   - Heter på svenska ungefär *"Publicera i en kanal när en webhookbegäran tas emot"*.
4. Logga in / bekräfta anslutningen till Microsoft Teams och klicka **Nästa**.
5. Välj **Team** och **Kanal** (samma som du utgick ifrån) och klicka **Skapa flöde**.
6. Kopiera **URL:en** som visas när flödet är klart. Den ser ut ungefär så här:
   `https://prod-xx.westeurope.logic.azure.com:443/workflows/…/triggers/manual/paths/invoke?…&sig=…`
   - Kommer du inte åt den igen senare: öppna flödet i Power Automate, gå till triggern
     *"When a Teams webhook request is received"* och kopiera URL:en därifrån.

Behörighet: du behöver kunna skapa flöden i din Microsoft 365-miljö. Är **Workflows** utgråat i
menyn har er IT stängt av Power Automate för kanalen — då får de skapa flödet åt er och lämna
ut URL:en.

**URL:en är en hemlighet.** Den som har den kan posta i kanalen utan att logga in. Den ska
därför inte checkas in i git — se nästa steg.

## 2. Lägg in URL:en i konfigurationen

`AvekiScrum.Api/appsettings.json` har en plats för den:

```json
"Teams": {
  "ReviewWebhookUrl": {
    "Default": "",
    "Nord": "",
    "Syd": ""
  }
}
```

`Nord` och `Syd` används per team; `Default` gäller för team som saknar egen rad. Vill du börja
med en gemensam kanal räcker det att fylla i `Default`.

Eftersom URL:en är en hemlighet är det bättre att lägga den som en miljövariabel än i JSON-filen
(samma mönster som `AzureDevOps__PAT`):

```powershell
[Environment]::SetEnvironmentVariable("Teams__ReviewWebhookUrl__Syd", "https://prod-…", "User")
```

Starta om Api:t efter att du satt variabeln.

Lämnas allt tomt fungerar förhandsgranskningen ändå — men **Publicera till Teams** svarar då med
att ingen webhook är konfigurerad, i stället för att skicka något.

## 3. Så används det

1. Tagga korten i Review-boarden (Visning / Muntligt / Skriftligt).
2. Klicka **Förhandsgranska**. Modalen går igenom en panel i taget med korten grupperade per
   utvecklare.
3. **Godkänn** bygger rapporten och visar den — inget har skickats än.
4. **Publicera till Teams** postar exakt den rapport du precis läste.

Rapporten skickas som ett Adaptive Card: rubrik, sprint, och per panel korten grupperade på
utvecklare med klickbara ID:n. Tomma paneler utelämnas helt.

## Om det inte fungerar

| Symptom | Trolig orsak |
|---|---|
| "Ingen Teams-webhook är konfigurerad" | `Teams:ReviewWebhookUrl` är tom för teamet och saknar `Default`. |
| "Teams svarade 400: …" | Flödet finns men avvisar payloaden — kontrollera att mallen är *webhook → post to channel* och inte en annan mall. |
| "Teams svarade 401/403" | URL:en är avstängd eller roterad. Öppna flödet i Power Automate och hämta en ny. |
| Meddelandet kommer fram men ser oformaterat ut | Flödet postar rå text i stället för kortet. Använd mallen ovan, som skickar vidare `attachments` som ett Adaptive Card. |

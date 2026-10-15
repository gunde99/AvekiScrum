// ⚠️ DEMO – TA BORT FÖRE SKARP ANVÄNDNING. Hårdkodade kunder och moduler för att visa
// "Ny uppgradering" i Labday-POC:en. Riktiga kunder och deras moduler ska komma från ett register
// (se UPPGRADERINGSDOKUMENTATION_SPEC.md, F5 och avsnittet "Demo-data som ska bort").
//
// Modulnamnen är wikisidornas titlar. Alla sidor med "Gäller: Alla kunder" kommer med automatiskt
// och står därför inte här. Varje kund har en egen kombination, så att det syns i kryssrutorna när
// man byter kund.

export interface DemoCustomer {
  name: string;
  modules: string[];
}

export const DEMO_CUSTOMERS: DemoCustomer[] = [
  {
    name: "Värnamo kommun",
    modules: ["Ledningskollen", "GO-appar", "VA-banken GO", "GO-appar - Installationstest", "VA-trans"],
  },
  {
    name: "Kungsbacka kommun",
    modules: ["VASS", "Utskick - ServiceAlert", "myCarta Composer", "GO-appar", "VA-banken GO", "Invent GO", "GO-appar - Installationstest"],
  },
  {
    name: "Lerums kommun",
    modules: ["Ledningskollen", "VASS", "VA-trans"],
  },
  {
    name: "NSVA",
    modules: ["Utskick - ServiceAlert", "myCarta Composer", "GO-appar", "Invent GO", "Energi GO", "GO-appar - Installationstest", "VA-trans"],
  },
  {
    name: "Simrishamns kommun",
    modules: ["Utskick - ServiceAlert", "GO-appar", "VA-banken GO", "GO-appar - Installationstest"],
  },
  {
    name: "Aarhus Vand (DK)",
    modules: ["Danmark", "Utskick - ServiceAlert", "VA-trans"],
  },
];

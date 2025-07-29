const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const { getPriceFromTenFour } = require("../scraper/webScraper");
const express = require("express");
const router = express.Router();

router.post("/", async (req, res) => {
  const { description } = req.body;

  const extractPrompt = `
  Du er en byggekalkulatør.  
 

  Giv mig en JSON-liste over de materialer, der skal bruges,  
  hvor hvert element har:
    - "keyword": en realistisk produkt-søgning der giver ét match på 10-4.dk
    - Vær specifik ift. tykkelse, mål, materiale og form (fx "12mm gipsplade 900x2400", ikke bare "gips").
    - Brug kun materialer der med høj sandsynlighed findes på 10-4.dk
    - Undlad lim, fuge, specialdele medmindre du kan give et konkret søgeord.
    - Gipsplader er altid 900mm brede. 
    - Andre plader er som udgangspunkt 1220mm brede.


  Eksempel-output:
  [
    {"keyword": "12mm gipsplade 900x2400", "quantity_hint": "stk"},
    {"keyword": "stållægte 70mm", "quantity_hint": "stk"}
  ]
  Svar KUN med JSON – ingen kommentar.
   Opgave: "${description}"
  `;

  let keywords = [];
  try {
    const extResp = await openai.chat.completions.create({
      model: "gpt-4", // billig & hurtig nok til extraction
      messages: [{ role: "user", content: extractPrompt }],
      temperature: 0,
    });
    const jsonText = extResp.choices[0].message.content
      .trim()
      .replace(/^```(?:json)?/, "")
      .replace(/```$/, "");

    keywords = JSON.parse(jsonText).map((m) => m.keyword);
  } catch (err) {
    console.error("❌ Kunne ikke udtrække materialer:", err);
    return res.status(500).json({ error: "Materiale-udtræk fejlede" });
  }

  let priceLines = "";
  for (const kw of keywords) {
    try {
      const p = await getPriceFromTenFour(kw);
      if (p.unit_price_stk) {
        priceLines += `- ${kw} = ${p.unit_price_stk} kr/stk\n`;
      }
    } catch (e) {
      console.warn("Pris mangler for", kw);
    }
  }
  const prompt = `
Du er en byggekalkulatør og skal give mig et prisoverslag, samt materialeliste.

1. Udtræk rumbeskrivelser og beregn arealer korrekt som længde × bredde. Undgå fejl som længde + bredde. Vis gerne udregningen tydeligt.
2. Find ud af hvor stor en mængde, og hvilke, af hver materiale, som skal bruges.
3. Vurdér hvordan konstruktionen skal være for at den bliver billigst i henhold til materialespild.
4. Alle dine foreslag og konstruktioner skal være i overensstemmelse med BR18.
5. Estimér totalpris baseret på typiske danske priser fra fx STARK.dk, Lavpris Træ osv.

 - Gipsplader er altid 900mm brede. 
 - Andre plader er som udgangspunkt 1220mm brede.


Aktuelle dagspriser fra 10-4.dk (brug dem i dine beregninger):
${priceLines}

Opgave: ${description}
Svar med oversigt over materialer, forbrug og prisoverslag.

`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    // Tilføjet debug log
    console.log("GPT response:", response);

    if (!response.choices || response.choices.length === 0) {
      return res.status(500).json({ error: "Tomt svar fra OpenAI" });
    }

    res.json({ estimate: response.choices[0].message.content });
  } catch (err) {
    console.error("OpenAI fejl:", err);
    res.status(500).json({ error: "Fejl ved beregning fra OpenAI" });
  }
});

module.exports = router;

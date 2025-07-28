const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const express = require("express");
const router = express.Router();

router.post("/", async (req, res) => {
  const { description } = req.body;

  const prompt = `
Du er en byggekalkulatør.

1. Udtræk alle materialer og angiv hvor mange m² eller meter de dækker.
2. Angiv hvor mange enheder (fx plader eller lægter) der skal bruges for at dække det areal eller den længe som opgaven kræver.
3. Udregninger skal være i overensstemmelse med BR18.
4. Estimér totalpris baseret på typiske danske priser fra fx STARK.dk, Lavpris Træ osv.

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

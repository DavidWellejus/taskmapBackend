const axios = require("axios");
const cheerio = require("cheerio");
const { OpenAI } = require("openai");

// 1. Brug OpenAI til at finde materialer og mængder
async function extractMaterialsFromText(description) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = `
Du er en byggekalkulatør. Udtræk de materialer og mængder der nævnes i teksten nedenfor.

Svar i dette JSON-format:
{
  "materials": [
    { "name": "krydsfiner 12 mm", "quantity": 6 },
    { "name": "reglar 45x95 mm", "quantity": 10 }
  ]
}

Tekst:
${description}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
  });

  const content = completion.choices[0].message.content.trim();

  try {
    const parsed = JSON.parse(content);
    return parsed.materials;
  } catch (err) {
    throw new Error("Kunne ikke parse OpenAI-svaret som JSON.");
  }
}

// 2. Søg på STARK og scrap første pris
async function getPriceFromStark(keyword) {
  const url = `https://www.stark.dk/Search?keyword=${encodeURIComponent(
    keyword
  )}`;
  const res = await axios.get(url);
  const $ = cheerio.load(res.data);

  const firstProduct = $(".product-tile").first();
  const name = firstProduct.find(".product-title").text().trim();
  const priceText = firstProduct
    .find(".sales .value")
    .text()
    .replace(",", ".")
    .trim();
  const price = parseFloat(priceText);

  if (!name || isNaN(price)) {
    throw new Error(`Ingen gyldig pris fundet for: ${keyword}`);
  }

  return { name, unit_price: price };
}

// 3. Saml det hele
async function estimatePriceFromText(description) {
  const materials = await extractMaterialsFromText(description);

  const items = [];

  for (const mat of materials) {
    const result = await getPriceFromStark(mat.name);
    const total = result.unit_price * mat.quantity;

    items.push({
      name: result.name,
      quantity: mat.quantity,
      unit_price: result.unit_price,
      total: Math.round(total * 100) / 100,
    });
  }

  const total_price = items.reduce((sum, item) => sum + item.total, 0);

  return {
    items,
    total_price: Math.round(total_price * 100) / 100,
  };
}

module.exports = { estimatePriceFromText };

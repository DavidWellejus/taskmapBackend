const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");
const { OpenAI } = require("openai");

// 1. Brug OpenAI til at finde materialer og mængder
async function extractMaterialsFromText(description) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = `
Du er en byggekalkulatør.

1. Udtræk alle materialer og angiv hvor mange m² eller meter de dækker.
2. Angiv hvor mange enheder (fx plader eller lægter) der skal bruges.
3. Hvis muligt, antag en standardstørrelse (fx 1200x2400 mm = 2.88 m²) og brug det i beregningen.

Returnér kun dette JSON-format:
{
  "materials": [
    {
      "name": "krydsfiner 12 mm",
      "area_required_m2": 14,
      "unit_area_m2": 2.88,
      "units_needed": 5
    }
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

  const browser = await puppeteer.launch({
    headless: false, // Åbn browser GUI
    slowMo: 50, // Gør det langsommere så du kan følge med
    defaultViewport: null, // Brug fuld vindue
  });

  const page = await browser.newPage();

  // Log fra browserens console til din terminal
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
  } catch (err) {
    await browser.close();
    throw new Error(`Kunne ikke loade STARK: ${err.message}`);
  }

  try {
    await page.waitForSelector("button#onetrust-accept-btn-handler", {
      timeout: 5000,
    });
    await page.click("button#onetrust-accept-btn-handler");
    console.log("✅ Accepterede cookies");
  } catch {
    console.log("ℹ️ Ingen cookie-popup");
  }

  try {
    await page.waitForSelector(".product-item", { timeout: 10000 });
    console.log("✅ Produktliste fundet");
  } catch (err) {
    await browser.close();
    throw new Error("❌ Kunne ikke finde produktlisten ('.product-item')");
  }

  const result = await page.evaluate(() => {
    const name = document.querySelector(".product-title")?.innerText.trim();

    const priceElements = Array.from(document.querySelectorAll(".text-right"))
      .map((el) => el.innerText.trim())
      .filter((text) => text.includes("/") && text.match(/\d+,\d+/));

    const pricePerPieceText = priceElements.find((p) => p.includes("/ PL"));
    const pricePerM2Text = priceElements.find((p) => p.includes("/ M2"));

    return {
      name,
      pricePerPiece: pricePerPieceText?.match(/[\d.,]+/)?.[0] ?? null,
      pricePerM2: pricePerM2Text?.match(/[\d.,]+/)?.[0] ?? null,
    };
  });

  await browser.close();

  if (!result || !result.name) {
    throw new Error(`Ingen gyldig pris fundet for: ${keyword}`);
  }

  return {
    name: result.name,
    unit_price_piece: result.pricePerPiece
      ? parseFloat(result.pricePerPiece.replace(",", "."))
      : null,
    unit_price_m2: result.pricePerM2
      ? parseFloat(result.pricePerM2.replace(",", "."))
      : null,
  };

  const price = parseFloat(result.priceText.replace(",", "."));
  return { name: result.name, unit_price: price };
}

// 3. Saml det hele
async function estimatePriceFromText(description) {
  const materials = await extractMaterialsFromText(description);

  const items = [];

  for (const mat of materials) {
    const result = await getPriceFromStark(mat.name);
    const pricePiece = result.unit_price_piece ?? 0;
    const priceM2 = result.unit_price_m2 ?? 0;

    const priceFromPiece = pricePiece * mat.units_needed;
    const priceFromM2 = priceM2 * mat.area_required_m2;

    items.push({
      name: result.name,
      quantity: mat.units_needed,
      unit_price_piece: pricePiece,
      unit_price_m2: priceM2,
      area_required_m2: mat.area_required_m2,
      total_price_piece: Math.round(priceFromPiece * 100) / 100,
      total_price_m2: Math.round(priceFromM2 * 100) / 100,
    });
  }

  const total_price = items.reduce(
    (sum, item) => sum + Math.min(item.total_price_piece, item.total_price_m2),
    0
  );
  return {
    items,
    total_price: Math.round(total_price * 100) / 100,
  };
}

module.exports = { estimatePriceFromText };

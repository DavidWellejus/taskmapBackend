const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");
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
    const product = document.querySelector(".product-item");
    if (!product) return null;

    const name = product.querySelector("a")?.innerText?.trim();
    const priceText = product.querySelector(".memberprice")?.innerText?.trim();

    return { name, priceText };
  });

  await browser.close();

  if (!result || !result.name || !result.priceText) {
    throw new Error(`❌ Ingen gyldig pris fundet for: ${keyword}`);
  }

  const price = parseFloat(result.priceText.replace(",", "."));
  return { name: result.name, unit_price: price };
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

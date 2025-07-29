async function getPriceFromTenFour(keyword) {
  const url = `https://www.10-4.dk/soeg?q=${encodeURIComponent(keyword)}`;

  const browser = await puppeteer.launch({
    headless: true,
    slowMo: 50,
    defaultViewport: null,
  });

  const page = await browser.newPage();
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
  } catch (err) {
    await browser.close();
    throw new Error(`Kunne ikke loade 10-4: ${err.message}`);
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
    await page.waitForSelector(".product-card", { timeout: 10000 });
    console.log("✅ Produktliste fundet");
  } catch (err) {
    await browser.close();
    throw new Error("❌ Kunne ikke finde produktlisten ('.product-card')");
  }

  const result = await page.evaluate(() => {
    const card = document.querySelector(".product-card");
    if (!card) return null;

    const name = card.querySelector(".text-truncate")?.innerText.trim();
    const priceText = card.querySelector(".price-value")?.innerText.trim(); // f.eks. "68,00 kr."

    const numeric = priceText
      ? parseFloat(priceText.replace(/\./g, "").replace(",", "."))
      : null;

    return {
      name,
      price_stk: numeric,
    };
  });

  await browser.close();

  if (!result || !result.name) {
    throw new Error(`Ingen gyldig pris fundet for: ${keyword}`);
  }

  return {
    name: result.name,
    unit_price_stk: result?.price_stk ?? null,
  };
}
module.exports = { getPriceFromTenFour };

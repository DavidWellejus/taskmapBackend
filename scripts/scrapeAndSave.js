const fs = require("fs");
const path = require("path");
const { scrapeStarkCatalog } = require("../scraper/webScraper");

async function runScraper() {
  try {
    console.log("🔍 Starter STARK-scraper...");

    const catalog = await scrapeStarkCatalog();

    const filePath = path.join(__dirname, "../data/stark_catalog.json");
    fs.writeFileSync(filePath, JSON.stringify(catalog, null, 2), "utf-8");

    console.log(`✅ Gemte ${catalog.length} produkter i: ${filePath}`);
  } catch (err) {
    console.error("❌ Fejl under scraping:", err);
  }
}

runScraper();

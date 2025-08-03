const axios = require("axios");
const cheerio = require("cheerio");
const xml2js = require("xml2js");
const puppeteer = require("puppeteer");

async function getCategoryUrls() {
  const sitemapUrl = "https://www.stark.dk/sitemapcategories.xml";
  const { data } = await axios.get(sitemapUrl);
  const parsed = await xml2js.parseStringPromise(data);
  const urls = parsed.urlset.url.map((entry) => entry.loc[0]);
  return urls.filter((url) => url.includes("/byggematerialer"));
}

async function extractProductUrlsFromCategory(url) {
  console.log("Forsøger kategori:", url);
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2" });
  await page.evaluate(() => window.scrollBy(0, window.innerHeight * 3));
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const html = await page.content();
  const $ = cheerio.load(html);
  const productLinks = [];

  $(".product-item a").each((_, el) => {
    const href = $(el).attr("href");
    if (href && href.includes("/")) {
      const fullUrl = href.startsWith("http")
        ? href
        : `https://www.stark.dk${href}`;
      productLinks.push(fullUrl);
    }
  });

  await browser.close();
  return [...new Set(productLinks)];
}

async function extractProductData(url) {
  const puppeteer = require("puppeteer");
  const cheerio = require("cheerio");

  console.log(`🔍 Scraper produkt: ${url}`);
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2" });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const html = await page.content();
  await browser.close();

  const $ = cheerio.load(html);

  // ✅ NY: Få navn ud fra h1 med class som matcher (fx pb-0)
  const name = $("h1").first().text().trim();
  console.log(`📦 Fundet navn: ${name}`);

  const prices = [];

  // 💶 Pris inkl. moms (eksempel: 131,65 / PL og 60,95 / M2)
  $(".price-area .text-right").each((_, el) => {
    const text = $(el).text().trim();
    console.log(`💶 Fundet pris-tekst: "${text}"`);
    const match = text.match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*\/\s*(\w+)/i);
    if (match) {
      const amount = parseFloat(match[1].replace(/\./g, "").replace(",", "."));
      const unit = match[2].toUpperCase();
      prices.push({ amount, unit, type: "inkl_moms" });
      console.log(`✅ Matcher: Pris = ${amount}, Enhed = ${unit}`);
    }
  });

  if (!name || prices.length === 0) {
    console.warn(`⛔️ Manglede data fra: ${url}`);
    return null;
  }

  return { name, url, prices };
}
async function scrapeStarkCatalog() {
  const catalog = [];

  const productUrls = [
    "https://www.stark.dk/raw-standard-gips-ak-13-mm-900-mm-2400-mm?id=4100-9760226",
  ];

  for (const url of productUrls) {
    try {
      const product = await extractProductData(url);
      if (product && product.name && product.price) {
        catalog.push(product);
      } else {
        console.warn("⛔️ Manglede data fra:", url);
      }
    } catch (err) {
      console.error("❌ Fejl ved produkt:", url, err.message);
    }
  }

  return catalog;
}

module.exports = { scrapeStarkCatalog };

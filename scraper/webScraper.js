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
  const fs = require("fs");

  console.log(`🔍 Scraper produkt: ${url}`);

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2" });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const html = await page.content();
  await browser.close();

  // Gem HTML til debug
  fs.writeFileSync("debug.html", html);

  const $ = cheerio.load(html);

  const name = $(".product-title").first().text().trim();
  console.log("📦 Fundet navn:", name);

  let price = null;
  let unit = null;

  $(".price-area div.text-right").each((i, el) => {
    const text = $(el).text().trim();
    console.log(`💶 Fundet pris-tekst: "${text}"`);

    const match = text.match(/([\d.,]+)\s*\/\s*(PL|STK|M2)/i);
    if (match) {
      price = parseFloat(match[1].replace(".", "").replace(",", "."));
      unit = match[2].toUpperCase();
      console.log(`✅ Matcher: Pris = ${price}, Enhed = ${unit}`);
    }
  });

  if (!name || !price || !unit) {
    console.warn("⛔️ Manglede data fra:", url);
    return null;
  }

  return { name, price, unit, url };
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

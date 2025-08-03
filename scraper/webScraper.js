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

  console.log("🔍 Scraper produkt:", url);
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2" });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const html = await page.content();
  await browser.close();

  const $ = cheerio.load(html);
  const jsonLdRaw = $('script[type="application/ld+json"]').html();

  if (!jsonLdRaw) {
    console.warn(`⛔️ Intet JSON-LD fundet på: ${url}`);
    return null;
  }

  let json;
  try {
    json = JSON.parse(jsonLdRaw);
  } catch (err) {
    console.warn(`⛔️ Kunne ikke parse JSON-LD: ${err.message}`);
    return null;
  }

  const name = json.name;
  const image = Array.isArray(json.image) ? json.image[0] : json.image;
  const sku = json.sku;
  const description = json.description;
  const price = parseFloat(json.offers?.price ?? 0);
  const currency = json.offers?.priceCurrency ?? "DKK";

  if (!name || !price) {
    console.warn(`⛔️ Manglede data i JSON-LD: ${url}`);
    return null;
  }

  return {
    name,
    image,
    sku,
    description,
    price,
    currency,
    url,
  };
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

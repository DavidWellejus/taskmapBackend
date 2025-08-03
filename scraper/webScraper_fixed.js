const axios = require("axios");
const cheerio = require("cheerio");
const xml2js = require("xml2js");
const puppeteer = require("puppeteer");
const fs = require("fs");

async function getCategoryUrls() {
  const sitemapUrl = "https://www.stark.dk/sitemapcategories.xml";
  const { data } = await axios.get(sitemapUrl);
  const parsed = await xml2js.parseStringPromise(data);
  const urls = parsed.urlset.url.map((entry) => entry.loc[0]);
  return urls.filter((url) => url.includes("/byggematerialer"));
}

async function extractSubcategoryUrls(page, categoryUrl) {
  await page.goto(categoryUrl, { waitUntil: "networkidle2" });
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const html = await page.content();
  const $ = cheerio.load(html);
  const subcategoryUrls = [];

  $(".stark-category-item a").each((_, el) => {
    const href = $(el).attr("href");
    if (href && href.startsWith("/")) {
      subcategoryUrls.push("https://www.stark.dk" + href);
    }
  });

  return subcategoryUrls.length > 0 ? subcategoryUrls : [categoryUrl];
}

async function extractProductUrlsFromCategory(page, url) {
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

  return [...new Set(productLinks)];
}

async function extractProductData(page, url) {
  console.log("🔍 Scraper produkt:", url);
  await page.goto(url, { waitUntil: "networkidle2" });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const html = await page.content();

  const $ = cheerio.load(html);
  const jsonLdRaw = $('script[type="application/ld+json"]').first().html();
  if (!jsonLdRaw) return null;

  let data = null;
  try {
    data = JSON.parse(jsonLdRaw);
  } catch (err) {
    console.warn("❌ Kunne ikke parse JSON-LD:", url);
    return null;
  }

  if (!data.name || !data.offers?.price) {
    console.warn("⛔️ Manglede data fra:", url);
    return null;
  }

  console.log(`✅ Produkt fundet: ${data.name} – ${data.offers.price} kr`);

  return {
    name: data.name,
    price: parseFloat(data.offers.price),
    unit: "DKK",
    url,
  };
}

async function scrapeStarkCatalog() {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  const categoryUrls = await getCategoryUrls();
  const catalog = [];

  for (const categoryUrl of categoryUrls) {
    console.log("🔍 Kigger på kategori:", categoryUrl);
    try {
      const subcategoryUrls = await extractSubcategoryUrls(page, categoryUrl);
      for (const subUrl of subcategoryUrls) {
        const productUrls = await extractProductUrlsFromCategory(page, subUrl);
        for (const productUrl of productUrls) {
          const product = await extractProductData(page, productUrl);
          if (product) {
            catalog.push(product);
          }
        }
      }
    } catch (err) {
      console.warn("❌ Fejl under scraping:", err.message);
    }
  }

  await browser.close();
  return catalog;
}

module.exports = { scrapeStarkCatalog };

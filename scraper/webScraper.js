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

async function extractSubcategoryUrls(categoryUrl) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto(categoryUrl, { waitUntil: "networkidle2" });
  await page.waitForTimeout(2000);

  const html = await page.content();
  const $ = cheerio.load(html);

  const subcategoryUrls = [];
  $(".stark-category-item a").each((_, el) => {
    const href = $(el).attr("href");
    if (href && href.startsWith("/")) {
      subcategoryUrls.push("https://www.stark.dk" + href);
    }
  });

  await browser.close();
  return subcategoryUrls;
}

async function extractProductUrls(categoryOrSubUrl) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto(categoryOrSubUrl, { waitUntil: "networkidle2" });
  await page.waitForTimeout(2000);

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
  console.log("🔍 Scraper produkt:", url);
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2" });
  await page.waitForTimeout(1500);

  const html = await page.content();
  const $ = cheerio.load(html);

  const jsonLd = $('script[type="application/ld+json"]').html();
  if (!jsonLd) {
    await browser.close();
    console.warn("⛔️ Manglede JSON-LD i:", url);
    return null;
  }

  let data;
  try {
    data = JSON.parse(jsonLd);
  } catch (err) {
    console.warn("⛔️ Fejl ved parsing af JSON-LD i:", url);
    return null;
  }

  await browser.close();

  return {
    name: data.name,
    price: data.offers?.price ? parseFloat(data.offers.price) : null,
    currency: data.offers?.priceCurrency || "DKK",
    url: url,
    sku: data.sku,
    description: data.description,
    image: data.image?.[0] || null,
  };
}

async function scrapeStarkCatalog() {
  const catalog = [];
  const mainCategories = await getCategoryUrls();

  for (const categoryUrl of mainCategories) {
    console.log("🔍 Kigger på kategori:", categoryUrl);
    const subcategories = await extractSubcategoryUrls(categoryUrl);
    const targets = subcategories.length > 0 ? subcategories : [categoryUrl];

    for (const subUrl of targets) {
      console.log("➡️ Kigger på underkategori:", subUrl);
      const productUrls = await extractProductUrls(subUrl);

      for (const productUrl of productUrls) {
        const product = await extractProductData(productUrl);
        if (product && product.name && product.price) {
          catalog.push(product);
        }
      }
    }
  }

  return catalog;
}

module.exports = { scrapeStarkCatalog };

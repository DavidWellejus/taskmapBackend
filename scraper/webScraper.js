const axios = require("axios");
const cheerio = require("cheerio");
const xml2js = require("xml2js");

async function getSitemapUrls() {
  const robotsUrl = "https://www.stark.dk/robots.txt";
  const { data } = await axios.get(robotsUrl);

  // Find alle sitemap-linjer
  const sitemapLines = data
    .split("\n")
    .filter((line) => line.toLowerCase().startsWith("sitemap:"));

  const sitemapUrls = sitemapLines.map((line) =>
    line.replace(/sitemap:/i, "").trim()
  );

  const productUrls = [];

  for (const sitemapUrl of sitemapUrls) {
    const sitemapXml = await axios.get(sitemapUrl);
    const parsed = await xml2js.parseStringPromise(sitemapXml.data);

    // Hvis det er en sitemapIndex (fx sitemap.xml) => parse under-sitemaps
    if (parsed.sitemapindex?.sitemap) {
      for (const sm of parsed.sitemapindex.sitemap) {
        const loc = sm.loc?.[0];
        if (loc) {
          const innerXml = await axios.get(loc);
          const innerParsed = await xml2js.parseStringPromise(innerXml.data);
          const urls = innerParsed.urlset?.url || [];
          urls.forEach((entry) => {
            const url = entry.loc?.[0];
            if (url?.includes("byggematerialer")) {
              productUrls.push(url);
            }
          });
        }
      }
    }

    // Hvis det er en almindelig urlset sitemap
    if (parsed.urlset?.url) {
      parsed.urlset.url.forEach((entry) => {
        const url = entry.loc?.[0];
        if (url?.includes("byggematerialer")) {
          productUrls.push(url);
        }
      });
    }
  }

  return productUrls;
}

async function extractProductData(url) {
  const { data: html } = await axios.get(url);
  const $ = cheerio.load(html);

  const name = $("h1").first().text().trim(); // Produktnavn
  let priceText = $(".font-reg-16.text-right").first().text().trim(); // Pris + enhed

  // Eksempel: "60,95 / M2" → split
  let price = null;
  let unit = null;

  if (priceText.includes("/")) {
    const parts = priceText.split("/");
    price = parseFloat(parts[0].replace(",", ".").replace(/[^\d.]/g, ""));
    unit = parts[1].trim();
  }

  return {
    name,
    price,
    unit,
    url,
  };
}

async function scrapeStarkCatalog() {
  const productUrls = await getSitemapUrls();
  const catalog = [];

  for (const url of productUrls.slice(0, 50)) {
    try {
      const product = await extractProductData(url);
      if (product && product.name && product.price) {
        catalog.push(product);
      }
    } catch (err) {
      console.warn("Fejl ved scraping af:", url, err.message);
    }
  }

  return catalog;
}

module.exports = { scrapeStarkCatalog };

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { estimatePriceFromText } = require("./scraper/starkScraper");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/estimate", async (req, res) => {
  const { description } = req.body;

  try {
    const result = await estimatePriceFromText(description);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Noget gik galt under beregningen." });
  }
});

app.listen(5050, () => {
  console.log("Scraper backend kører på http://localhost:5050");
});

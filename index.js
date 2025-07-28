const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();
const estimateRoute = require("./routes/estimate"); // 👈 bruger GPT i stedet for scraping

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/estimate", estimateRoute); // 👈 nu bruges OpenAI-versionen

app.listen(5050, () => {
  console.log("GPT backend kører på http://localhost:5050");
});

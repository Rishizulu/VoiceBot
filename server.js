require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const axios = require('axios');
const cron = require('node-cron');
const twilio = require('twilio');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

/* ---------------- DB ---------------- */
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

/* ---------------- Gallabox ---------------- */
const gallaboxConfig = {
  accountId: process.env.GALLABOX_ACCOUNT_ID,
  apiKey: process.env.GALLABOX_API_KEY,
  apiSecret: process.env.GALLABOX_API_SECRET,
  channelId: process.env.GALLABOX_CHANNEL_ID,
  baseUrl: 'https://server.gallabox.com/devapi'
};

async function sendMessage(to, name, message) {
  const payload = {
    channelId: gallaboxConfig.channelId,
    channelType: "whatsapp",
    recipient: { name, phone: to },
    whatsapp: { type: "text", text: { body: message } }
  };

  await axios.post(`${gallaboxConfig.baseUrl}/messages/whatsapp`, payload, {
    headers: {
      apiKey: gallaboxConfig.apiKey,
      apiSecret: gallaboxConfig.apiSecret,
      'Content-Type': 'application/json'
    }
  });
}

/* ---------------- Load Categories ---------------- */
async function getCategories() {
  const [rows] = await db.query(`
    SELECT id, cat1_names 
    FROM u130660877_zulu.galleries
    WHERE cat1_names IS NOT NULL
  `);
  return rows;
}

/* ---------------- Vercel Blob Sync (Daily) ---------------- */
cron.schedule('0 8 * * *', async () => {
  console.log("⏰ Morning DB Sync Started");
  const data = await getCategories();
  await axios.post(process.env.VERCEL_BLOB_API, { data });
  console.log("☁ Blob Updated");
});

/* ---------------- Voice Bot ---------------- */
app.post('/voice', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say("Hi, this is Zulu Assistant. Please say a product name.");
  
  const gather = twiml.gather({
    input: 'speech',
    timeout: 5,
    speechTimeout: 'auto',
    action: '/process',
    method: 'POST'
  });

  gather.say("You can say: Jhula, Mudha, Kaleen, Lantern, Cushion, Table, Vase and more.");

  res.type('text/xml');
  res.send(twiml.toString());
});

/* ---------------- Process Speech ---------------- */
app.post('/process', async (req, res) => {
  const speech = req.body.SpeechResult || '';
  const from = req.body.From;

  const [rows] = await db.query(`
    SELECT cat1_names FROM u130660877_zulu.galleries 
    WHERE cat1_names LIKE ?
    LIMIT 1
  `, [`%${speech}%`]);

  let message = "Sorry, no matching category found.";

  if (rows.length > 0) {
    message = `Here are products for ${speech}: ${rows[0].cat1_names}`;
    await sendMessage(from.replace('+', ''), "Customer", message);
  }

  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(message);
  twiml.redirect('/voice'); // Loop again in same call

  res.type('text/xml');
  res.send(twiml.toString());
});

/* ---------------- Start ---------------- */
app.listen(3000, () => {
  console.log("🚀 Voice Bot running on http://localhost:3000");
});

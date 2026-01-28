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
  await axios.post(process.env.BLOB_READ_WRITE_TOKEN, { data });
  console.log("☁ Blob Updated");
});

/* ---------------- Voice Bot ---------------- */
app.post('/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say("Hi this is Zulu Assistant.");
  twiml.say("Press 1 for Jhula.");
  twiml.say("Press 2 for Mudha.");
  twiml.say("Press 3 for Dilli ki Sardi.");
  twiml.say("Press 4 for Jharna.");
  twiml.say("Press 5 for Art.");
  twiml.say("Press 6 for Ghadi.");
  twiml.say("Press 7 for Kaleen.");
  twiml.say("Press 8 for Lantern.");
  twiml.say("Press 9 for Cushion.");
  twiml.say("Press 10 for Vase.");

  const gather = twiml.gather({
    numDigits: 2,
    action: '/process',
    method: 'POST',
    timeout: 10
  });

  res.type('text/xml');
  res.send(twiml.toString());
});

app.post('/process', async (req, res) => {
  const digit = req.body.Digits;
  const from = req.body.From;

  const map = {
    "1": "Jhula",
    "2": "Mudha",
    "3": "Dilli ki Sardi",
    "4": "Jharna",
    "5": "Art",
    "6": "Ghadi",
    "7": "Kaleen",
    "8": "Lantern",
    "9": "Cushion",
    "10": "Vase"
  };

  const selected = map[digit];
  let message = "Invalid option.";

  if (selected) {
    const [rows] = await db.query(
      `SELECT cat1_names FROM u130660877_zulu.galleries WHERE cat1_names LIKE ? LIMIT 1`,
      [`%${selected}%`]
    );

    if (rows.length) {
      message = `Products for ${selected}: ${rows[0].cat1_names}`;
      await sendMessage(from.replace('+',''), "Customer", message);
    } else {
      message = `No products found for ${selected}`;
    }
  }

  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(message);
  twiml.redirect('/voice'); // same call loop

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

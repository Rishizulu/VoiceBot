require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const axios = require('axios');
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
  console.log("📤 Sending WhatsApp to:", to, message);

  const payload = {
    channelId: gallaboxConfig.channelId,
    channelType: "whatsapp",
    recipient: { name, phone: to },
    whatsapp: {
      type: "text",
      text: { body: message }
    }
  };

  const response = await axios.post(
    `${gallaboxConfig.baseUrl}/messages/whatsapp`,
    payload,
    {
      headers: {
        apiKey: gallaboxConfig.apiKey,
        apiSecret: gallaboxConfig.apiSecret,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data;
}

/* ---------------- Voice Menu ---------------- */
app.post('/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say("Hi, this is Zulu Assistant.");
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

  twiml.gather({
    numDigits: 2,
    timeout: 10,
    action: '/process',
    method: 'POST'
  });

  res.type('text/xml');
  res.send(twiml.toString());
});

/* ---------------- Process Key ---------------- */
app.post('/process', async (req, res) => {
  const digit = req.body.Digits;
  const from = req.body.From;
  const waNumber = from.replace('+', '').replace('whatsapp:', '');

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
  let message = "Invalid option selected.";

  if (selected) {
    const [rows] = await db.query(
      `SELECT cat1_names 
       FROM u130660877_zulu.galleries 
       WHERE cat1_names IS NOT NULL 
       AND cat1_names LIKE ? 
       LIMIT 1`,
      [`%${selected}%`]
    );

    if (rows.length > 0) {
      message = `Products for ${selected}: ${rows[0].cat1_names}`;

      // WhatsApp send in background
      sendMessage(waNumber, "Customer", message)
        .then(() => console.log("✅ Gallabox WhatsApp sent"))
        .catch(err => console.error("❌ Gallabox Error:", err.response?.data || err.message));
    } else {
      message = `No products found for ${selected}`;
    }
  }

  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(message);
  twiml.redirect('/voice'); // same call repeat menu

  res.type('text/xml');
  res.send(twiml.toString());
});

/* ---------------- Start ---------------- */
app.listen(3000, () => {
  console.log("🚀 Zulu Voice + Gallabox Bot running on port 3000");
});

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const axios = require('axios');
const twilio = require('twilio');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(__dirname));

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

/* ---------------- DB ---------------- */
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

/* ---------------- Gallabox ---------------- */
const gallaboxConfig = {
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

  return axios.post(`${gallaboxConfig.baseUrl}/messages/whatsapp`, payload, {
    headers: {
      apiKey: gallaboxConfig.apiKey,
      apiSecret: gallaboxConfig.apiSecret,
      'Content-Type': 'application/json'
    }
  });
}

/* ---------------- Outbound Call API ---------------- */
app.get('/call/:number', async (req, res) => {
  const to = "+" + req.params.number;
  try {
    const call = await client.calls.create({
      url: `${process.env.BASE_URL}/voice`,
      to,
      from: process.env.TWILIO_PHONE
    });
    res.json({ success: true, sid: call.sid });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

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
  const waNumber = from.replace('+','').replace('whatsapp:','');

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
      `SELECT id, cat1_names FROM u130660877_zulu.galleries 
       WHERE cat1_names IS NOT NULL`,
      [`%${selected}%`]
    );

    if (rows.length) {
      message = `Products for ${selected}: ${rows[0].cat1_names}`;

      sendMessage(waNumber, "Customer", message)
        .then(() => console.log("📤 WhatsApp sent"))
        .catch(e => console.log("❌ Gallabox error", e.response?.data));
    }
  }

  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(message);
  twiml.redirect('/voice');

  res.type('text/xml');
  res.send(twiml.toString());
});

/* ---------------- Start ---------------- */
app.listen(3000, () => console.log("🚀 Server running on 3000"));

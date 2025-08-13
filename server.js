import express from "express";
import { makeWASocket, useMultiFileAuthState, Browsers } from "@whiskeysockets/baileys";
import qrcode from "qrcode";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

let sock; // Store current connection

// QR login
app.get("/qr", async (req, res) => {
  try {
    const { state, saveCreds } = await useMultiFileAuthState("auth");
    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: Browsers.macOS("Desktop"),
    });

    sock.ev.on("connection.update", async (update) => {
      const { qr } = update;
      if (qr) {
        const qrImg = await qrcode.toDataURL(qr);
        res.json({ ok: true, qr: qrImg });
      }
    });

    sock.ev.on("creds.update", saveCreds);
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// Pairing code login
app.post("/pair", async (req, res) => {
  const { number } = req.body;
  if (!number) return res.json({ ok: false, error: "Phone number required" });

  try {
    const { state, saveCreds } = await useMultiFileAuthState("auth");
    sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      browser: Browsers.macOS("Desktop"),
    });

    const code = await sock.requestPairingCode(number);
    res.json({ ok: true, code });
    sock.ev.on("creds.update", saveCreds);
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

app.listen(3000, () => console.log("✅ Server running on port 3000"));

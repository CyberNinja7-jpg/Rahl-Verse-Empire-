import express from "express";
import fs from "fs";
import pkg from "@whiskeysockets/baileys";
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, generatePairingCode } = pkg;
import pino from "pino";
import qrcode from "qrcode";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

// Load .env
dotenv.config();

// Fix __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static("public"));

// === Ensure auth/rahl directory exists ===
const authFolder = path.join(__dirname, "auth", "rahl");
if (fs.existsSync(authFolder)) {
    if (!fs.lstatSync(authFolder).isDirectory()) {
        fs.unlinkSync(authFolder); 
        fs.mkdirSync(authFolder, { recursive: true });
        console.log(`📂 Recreated auth folder at ${authFolder}`);
    }
} else {
    fs.mkdirSync(authFolder, { recursive: true });
    console.log(`📁 Created auth folder at ${authFolder}`);
}

let sock;

// === Start WhatsApp connection ===
async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, qr } = update;

        if (connection === "open") {
            console.log("✅ WhatsApp Connected");
            if (process.env.OWNER_NUMBER) {
                const ownerJid = `${process.env.OWNER_NUMBER}@s.whatsapp.net`;
                await sock.sendMessage(ownerJid, { 
                    text: `✅ ${process.env.BOT_NAME || "Rahl Quantum"} is online!`
                });
            }
        } 
        else if (connection === "close") {
            console.log("❌ Disconnected, reconnecting...");
            setTimeout(startSock, 5000);
        }

        if (qr) {
            console.log("📲 QR Code generated");
        }
    });
}

// Start bot
startSock();

// === QR endpoint ===
app.get("/qr", async (req, res) => {
    if (!sock) return res.json({ ok: false, error: "Socket not ready" });

    let sent = false;
    sock.ev.on("connection.update", ({ qr }) => {
        if (qr && !sent) {
            sent = true;
            qrcode.toDataURL(qr, (err, url) => {
                if (err) return res.json({ ok: false, error: err.message });
                res.json({ ok: true, qr: url });
            });
        }
    });
});

// === Pairing code endpoint ===
app.get("/pair", async (req, res) => {
    try {
        if (!process.env.OWNER_NUMBER) return res.json({ ok: false, error: "OWNER_NUMBER not set" });

        // Generate 8-digit pairing code (multi-device)
        const { code } = await generatePairingCode(sock, process.env.OWNER_NUMBER);
        
        // Send the code to owner via WhatsApp
        const ownerJid = `${process.env.OWNER_NUMBER}@s.whatsapp.net`;
        await sock.sendMessage(ownerJid, { text: `📲 Your 8-digit pairing code: ${code}` });

        // Return code to frontend
        res.json({ ok: true, code });

    } catch (err) {
        res.json({ ok: false, error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

import express from "express";
import fs from "fs";
import makeWASocket, {
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
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

// === Force auth/rahl folder ===
const authFolder = path.join(__dirname, "auth", "rahl");

// If path exists but is a file, remove it
if (fs.existsSync(authFolder) && !fs.lstatSync(authFolder).isDirectory()) {
    fs.unlinkSync(authFolder);
}

// Ensure directory exists
if (!fs.existsSync(authFolder)) {
    fs.mkdirSync(authFolder, { recursive: true });
    console.log(`📂 Created auth folder at ${authFolder}`);
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

    // Save credentials
    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, qr } = update;

        if (connection === "open") {
            console.log("✅ WhatsApp Connected");

            // Send welcome message to owner
            if (process.env.OWNER_NUMBER) {
                const ownerJid = `${process.env.OWNER_NUMBER}@s.whatsapp.net`;
                await sock.sendMessage(ownerJid, {
                    text: `✅ ${process.env.BOT_NAME || "Rahl Quantum"} is now online! 🚀`
                });
            }
        } else if (connection === "close") {
            console.log("❌ Disconnected, reconnecting...");
            setTimeout(startSock, 5000);
        }

        if (qr) console.log("📲 QR Code generated");
    });
}

// Start bot
startSock();

// === API endpoint for QR code ===
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

// === API endpoint for pairing code ===
app.post("/pair", async (req, res) => {
    const number = req.body.number?.trim();
    if (!number) return res.json({ ok: false, error: "Number required" });

    try {
        // Generate a pseudo pairing code (simulate multidevice)
        const code = `lord rahl;;;${Buffer.from(
            `${number}-${Date.now()}`
        ).toString("base64")}`;

        // Notify owner via WhatsApp
        if (process.env.OWNER_NUMBER) {
            const ownerJid = `${process.env.OWNER_NUMBER}@s.whatsapp.net`;
            await sock.sendMessage(ownerJid, {
                text: `📡 Pairing requested for: ${number}\nSession ID:\n${code}`
            });
        }

        res.json({ ok: true, code });
    } catch (err) {
        res.json({ ok: false, error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

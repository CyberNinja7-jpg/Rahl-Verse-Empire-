import express from "express";
import fs from "fs";
import makeWASocket, {
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import pino from "pino";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.resolve();
const app = express();
app.use(express.json());
app.use(express.static("public"));

const authFolder = path.join(__dirname, "auth", "rahl");
if (!fs.existsSync(authFolder)) fs.mkdirSync(authFolder, { recursive: true });

let sock;
const sessionCodes = {}; // { code: { number, createdAt } }

// Start WhatsApp connection
async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    const { version } = await fetchLatestBaileysVersion();
    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" })
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "open") console.log("✅ WhatsApp Connected");
        else if (connection === "close") {
            console.log("❌ Connection closed. Reconnecting...");
            setTimeout(startSock, 5000);
        }
    });
}
startSock();

// Generate QR
app.get("/qr", async (req, res) => {
    try {
        const qr = await sock.requestPairingCode();
        res.json({ ok: true, qr });
    } catch (err) {
        res.json({ ok: false, error: err.message });
    }
});

// Generate pairing code and send to WhatsApp
app.post("/pair", async (req, res) => {
    const { number } = req.body;
    if (!number) return res.json({ ok: false, error: "Phone number required" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    sessionCodes[code] = { number, createdAt: Date.now() };

    try {
        const jid = `${number}@s.whatsapp.net`;
        await sock.sendMessage(jid, {
            text: `📡 *Rahl Quantum* pairing code generated!\n\nUse this code in the portal: *${code}*\n\n_This code will expire in 5 minutes._`
        });
        res.json({ ok: true, code });
    } catch (err) {
        res.json({ ok: false, error: err.message });
    }
});

// Verify pairing code, send session ID
app.post("/verify", async (req, res) => {
    const { code } = req.body;
    const session = sessionCodes[code];
    if (!session) return res.json({ ok: false, error: "Invalid or expired code" });

    // Check expiry (5 minutes)
    if (Date.now() - session.createdAt > 5 * 60 * 1000) {
        delete sessionCodes[code];
        return res.json({ ok: false, error: "Code expired" });
    }

    // Generate session ID starting with "lord rahl;;;"
    const randomStr = Buffer.from(Math.random().toString())
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "A")
        .replace(/\//g, "B");
    const sessionId = `lord rahl;;;${randomStr}`;

    try {
        const jid = `${session.number}@s.whatsapp.net`;
        await sock.sendMessage(jid, {
            text: `✅ *Your Session ID*:\n${sessionId}\n\n_Keep this safe!_`
        });

        delete sessionCodes[code];
        res.json({ ok: true, sessionId });
    } catch (err) {
        res.json({ ok: false, error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

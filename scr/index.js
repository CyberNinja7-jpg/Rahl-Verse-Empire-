import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { writeFileSync } from "fs";
import { OWNER_NUMBER } from "./config.js";

export async function startBot({ mode = "qr", number = "" }) {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: mode === "qr"
  });

  // Pairing code mode
  if (mode === "pair" && number) {
    if (!sock.requestPairingCode) throw new Error("Pairing code not supported in this Baileys version");
    const code = await sock.requestPairingCode(number);
    console.log(`📌 Pairing code for ${number}: ${code}`);
    return code;
  }

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr && mode === "qr") {
      console.log("📱 Scan this QR to log in:");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open") {
      console.log("✅ Rahl Quantum connected to WhatsApp");

      // Save session to file
      try {
        writeFileSync("auth/session.json", JSON.stringify(state.creds, null, 2));
        console.log("💾 Session saved to auth/session.json");

        // Optionally: send the session file to owner’s WhatsApp DM
        if (OWNER_NUMBER) {
          sock.sendMessage(`${OWNER_NUMBER}@s.whatsapp.net`, {
            document: Buffer.from(JSON.stringify(state.creds, null, 2)),
            mimetype: "application/json",
            fileName: "session.json",
            caption: "📦 Your Rahl Quantum session file"
          });
          console.log(`📨 Session sent to owner ${OWNER_NUMBER}`);
        }
      } catch (err) {
        console.error("❌ Failed to save/send session:", err);
      }
    }
    if (connection === "close") {
      console.log("⚠️ Connection closed", lastDisconnect?.error);
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // Example command listener
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0];
    if (!m.message || m.key.fromMe) return;

    const text = m.message.conversation || m.message.extendedTextMessage?.text || "";
    const sender = m.key.remoteJid;

    if (text.toLowerCase() === "!ping") {
      await sock.sendMessage(sender, { text: "🏓 Pong!" });
    }
  });

  return null; // QR mode doesn't return a code
}

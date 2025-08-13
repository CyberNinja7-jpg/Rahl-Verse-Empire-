import express from "express";
import { startBot } from "./src/index.js";

const app = express();
app.use(express.json());

// Health check
app.get("/", (_req, res) => {
  res.status(200).send("✅ Rahl Quantum is running");
});

// Generate pairing code
app.post("/pair", async (req, res) => {
  try {
    const number = (req.body?.number || "").replace(/[^0-9]/g, "");
    if (!number) return res.status(400).json({ ok: false, error: "Provide number like 2547XXXXXXX" });

    const code = await startBot({ mode: "pair", number });
    res.json({ ok: true, number, code });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Start with QR code (for local dev)
app.post("/start", async (_req, res) => {
  try {
    await startBot({ mode: "qr" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Rahl Quantum server running on port ${PORT}`);
});

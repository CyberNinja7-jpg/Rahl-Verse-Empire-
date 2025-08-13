// public/script.js

async function getPairingCode() {
  const number = document.getElementById("phoneNumber").value;
  if (!number) {
    alert("Enter your phone number first");
    return;
  }

  document.getElementById("status").innerText = "Generating pairing code...";

  const res = await fetch("/pair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ number })
  });

  const data = await res.json();
  if (data.ok) {
    document.getElementById("status").innerText = `Your code: ${data.code}`;
  } else {
    document.getElementById("status").innerText = `Error: ${data.error}`;
  }
}

async function getQRCode() {
  document.getElementById("status").innerText = "Getting QR code...";
  const res = await fetch("/qr");
  const data = await res.json();

  if (data.ok) {
    document.getElementById("qrImage").src = data.qr;
    document.getElementById("status").innerText = "Scan the QR with WhatsApp";
  } else {
    document.getElementById("status").innerText = `Error: ${data.error}`;
  }
}

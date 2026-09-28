const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock;
let qrCodeText = "";
let connectionStatus = "Desconectado";

async function conectarWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_jaya');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            qrCodeText = qr;
            connectionStatus = "Esperando escaneo de QR";
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error?.output?.statusCode) !== DisconnectReason.loggedOut;
            connectionStatus = "Desconectado";
            qrCodeText = "";
            if (shouldReconnect) conectarWhatsApp();
        } else if (connection === 'open') {
            connectionStatus = "Conectado Exitosamente";
            qrCodeText = "";
            console.log("¡WhatsApp conectado correctamente!");
        }
    });
}

app.get('/', (req, res) => {
    res.send(`
        <html lang="es"><head><meta charset="UTF-8"><title>Panel WhatsApp Club Jaya</title>
        <style>body{font-family:sans-serif;background:#0b0b0b;color:#fff;text-align:center;padding:40px;} .box{background:#161616;padding:20px;border-radius:8px;display:inline-block;border:1px solid #d4af37;margin-top:20px;} img{background:#fff;padding:10px;border-radius:4px;}</style>
        <script src="https://cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script></head><body>
        <h1>👑 Panel de Conexión WhatsApp - Club Jaya</h1>
        <div class="box"><h3>Estado: <span style="color:#d4af37">${connectionStatus}</span></h3>
        ${qrCodeText ? '<div id="qrcode" style="display:flex;justify-content:center;margin:15px 0;"></div><p>Escanea este código con tu WhatsApp en: <br><b>Dispositivos vinculados > Vincular un dispositivo</b></p>' : '<h2 style="color:#2ecc71">✔️ Tu servidor está en línea y enlazado.</h2>'}
        </div><script>if(document.getElementById("qrcode")){new QRCode(document.getElementById("qrcode"), "${qrCodeText}");}</script>
        </body></html>
    `);
});

app.post('/enviar-mensaje', async (req, res) => {
    const { telefono, mensaje } = req.body;
    if (!sock || connectionStatus !== "Conectado Exitosamente") {
        return res.status(500).json({ status: "error", mensaje: "El servidor de WhatsApp no está enlazado mediante QR todavía." });
    }
    try {
        const idFormateado = `${telefono}@s.whatsapp.net`;
        await sock.sendMessage(idFormateado, { text: mensaje });
        res.json({ status: "ok" });
    } catch (error) {
        res.status(500).json({ status: "error", mensaje: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
    conectarWhatsApp();
});

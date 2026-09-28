const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock;
let qrCodeText = "";
let connectionStatus = "Iniciando servidor...";

async function conectarWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_jaya');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        qrTimeout: 40000
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
    let contenidoDinamico = '';
    if (connectionStatus === "Conectado Exitosamente") {
        contenidoDinamico = '<h2 style="color:#2ecc71">✔️ Tu servidor está en línea y enlazado de forma real.</h2>';
    } else if (qrCodeText !== "") {
        contenidoDinamico = `<div id="qrcode" style="display:flex;justify-content:center;margin:20px 0;background:#fff;padding:15px;border-radius:4px;"></div>
                             <p>Escanea este código con tu WhatsApp en:<br><b>Dispositivos vinculados > Vincular un dispositivo</b></p>`;
    } else {
        contenidoDinamico = '<h3 style="color:#aaa;">Generando código de enlace...</h3><p>La página se refrescará automáticamente en unos segundos.</p>';
    }

    res.send(`
        <html lang="es"><head><meta charset="UTF-8"><title>Panel WhatsApp Club Jaya</title>
        <style>body{font-family:sans-serif;background:#0b0b0b;color:#fff;text-align:center;padding:40px;} .box{background:#161616;padding:20px;border-radius:8px;display:inline-block;border:1px solid #d4af37;margin-top:20px;min-width:300px;} img{background:#fff;padding:5px;border-radius:4px;}</style>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
        ${connectionStatus !== "Conectado Exitosamente" ? '<script>setTimeout(()=>{location.reload();}, 5000);</script>' : ''}
        </head><body>
        <h1>👑 Panel de Conexión WhatsApp - Club Jaya</h1>
        <div class="box"><h3>Estado: <span style="color:#d4af37">${connectionStatus}</span></h3>
        ${contenidoDinamico}
        </div>
        <script>
            if(document.getElementById("qrcode") && "${qrCodeText}" !== ""){
                new QRCode(document.getElementById("qrcode"), {
                    text: "${qrCodeText}",
                    width: 256,
                    height: 256
                });
            }
        </script>
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

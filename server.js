const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock;
let codigoVinculacion = "";
let connectionStatus = "Iniciando servidor...";

// REGLA DE ORO: Pon el número de teléfono del club aquí (con prefijo internacional, sin espacios ni el signo +)
// Ejemplo para Argentina: "5493874123456"
const NUMERO_TELEFONO_CLUB = "3885043963"; 

async function conectarWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_jaya');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        qrTimeout: 40000
    });

    sock.ev.on('creds.update', saveCreds);

    // Si no está registrado, solicitar el código de 8 dígitos de forma directa a WhatsApp
    if (!sock.authState.creds.registered) {
        connectionStatus = "Generando código de 8 dígitos...";
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(NUMERO_TELEFONO_CLUB);
                // Formatear el código con el guion intermedio reglamentario (Ej: ABCD-EFGH)
                codigoVinculacion = code?.match(/.{1,4}/g)?.join('-') || code;
                connectionStatus = "Esperando código en tu teléfono";
                console.log(`Código de vinculación generado: ${codigoVinculacion}`);
            } catch (err) {
                console.error("Error al solicitar código de vinculación:", err);
                connectionStatus = "Error de red. Reintentando...";
            }
        }, 6000);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error?.output?.statusCode) !== DisconnectReason.loggedOut;
            connectionStatus = "Desconectado";
            codigoVinculacion = "";
            if (shouldReconnect) conectarWhatsApp();
        } else if (connection === 'open') {
            connectionStatus = "Conectado Exitosamente";
            codigoVinculacion = "";
            console.log("¡WhatsApp conectado correctamente!");
        }
    });
}

app.get('/', (req, res) => {
    let contenidoDinamico = '';
    if (connectionStatus === "Conectado Exitosamente") {
        contenidoDinamico = '<h2 style="color:#2ecc71">✔️ Tu servidor está en línea y enlazado de forma real.</h2>';
    } else if (codigoVinculacion !== "") {
        contenidoDinamico = `
            <div style="font-size:2.8rem; font-weight:bold; color:#fff; background:#222; padding:15px; border-radius:6px; letter-spacing:4px; margin:20px 0; border:2px dashed #d4af37;">
                ${codigoVinculacion}
            </div>
            <p style="text-align:left; font-size:0.95rem; color:#ccc; line-height:1.5;">
                <b>Instrucciones para enlazar en tu celular:</b><br>
                1. Abre WhatsApp en tu teléfono.<br>
                2. Ve a <b>Ajustes / Configuración > Dispositivos vinculados</b>.<br>
                3. Selecciona <b>Vincular un dispositivo</b>.<br>
                4. Haz clic abajo en <b>"Vincular con el número de teléfono de todas formas"</b>.<br>
                5. Introduce el código de 8 letras que ves aquí arriba.
            </p>
        `;
    } else {
        contenidoDinamico = `<h3 style="color:#aaa;">${connectionStatus}</h3><p>La página se refrescará automáticamente en unos segundos.</p>`;
    }

    res.send(`
        <html lang="es"><head><meta charset="UTF-8"><title>Panel WhatsApp Club Jaya</title>
        <style>body{font-family:sans-serif;background:#0b0b0b;color:#fff;text-align:center;padding:40px;} .box{background:#161616;padding:25px;border-radius:8px;display:inline-block;border:1px solid #d4af37;margin-top:20px;max-width:380px;box-sizing:border-box;}</style>
        ${connectionStatus !== "Conectado Exitosamente" ? '<script>setTimeout(()=>{location.reload();}, 6000);</script>' : ''}
        </head><body>
        <h1>👑 Panel de Conexión WhatsApp - Club Jaya</h1>
        <div class="box"><h3>Estado: <span style="color:#d4af37">${connectionStatus}</span></h3>
        ${contenidoDinamico}
        </div>
        </body></html>
    `);
});

app.post('/enviar-mensaje', async (req, res) => {
    const { telefono, mensaje } = req.body;
    if (!sock || connectionStatus !== "Conectado Exitosamente") {
        return res.status(500).json({ status: "error", mensaje: "El servidor de WhatsApp no está enlazado todavía." });
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

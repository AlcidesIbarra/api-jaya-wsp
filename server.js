const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock;
let codigoVinculacion = "";
let connectionStatus = "Desconectado";

async function conectarWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_jaya');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        qrTimeout: 40000
    });

    sock.ev.on('creds.update', saveCreds);

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

// Endpoint para solicitar el código de vinculación desde la pantalla de forma dinámica
app.post('/solicitar-codigo', async (req, res) => {
    const { numero } = req.body;
    if (!numero) return res.status(400).json({ error: "Falta el número de teléfono" });
    if (!sock) return res.status(500).json({ error: "Servidor no inicializado" });
    
    try {
        connectionStatus = "Generando código de 8 dígitos...";
        let code = await sock.requestPairingCode(numero.trim());
        codigoVinculacion = code?.match(/.{1,4}/g)?.join('-') || code;
        connectionStatus = "Esperando código en tu teléfono";
        res.json({ status: "ok", codigo: codigoVinculacion });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error al solicitar código a WhatsApp" });
    }
});

// Endpoint para consultar el estado actual desde la pantalla sin recargar la página completa
app.get('/estado-conexion', (req, res) => {
    res.json({ estado: connectionStatus, codigo: codigoVinculacion });
});

app.get('/', (req, res) => {
    res.send(`
        <html lang="es"><head><meta charset="UTF-8"><title>Panel WhatsApp Club Jaya</title>
        <style>body{font-family:sans-serif;background:#0b0b0b;color:#fff;text-align:center;padding:40px;} .box{background:#161616;padding:25px;border-radius:8px;display:inline-block;border:1px solid #d4af37;margin-top:20px;max-width:380px;box-sizing:border-box;} .input-num{width:100%;padding:10px;margin-top:10px;border-radius:4px;border:1px solid #333;background:#222;color:#fff;font-size:1rem;box-sizing:border-box;} .btn-num{width:100%;background:#d4af37;color:#000;border:none;padding:10px;border-radius:4px;font-weight:bold;margin-top:10px;cursor:pointer;}</style>
        </head><body>
        <h1>👑 Panel de Conexión WhatsApp - Club Jaya</h1>
        <div class="box">
            <h3>Estado: <span id="txt-estado" style="color:#d4af37">${connectionStatus}</span></h3>
            <div id="contenedor-dinamico">
                ${connectionStatus === "Conectado Exitosamente" ? 
                    '<h2 style="color:#2ecc71">✔️ Tu servidor está en línea y enlazado de forma real.</h2>' : 
                    \`<p>Introduce el número de teléfono del Club para generar el código de enlace (con código de país, sin espacios ni el signo +):</p>
                    <input type="text" id="num_club" class="input-num" placeholder="Ej: 5493874123456">
                    <button onclick="generarCodigoTxt()" id="btn-disparar" class="btn-num">Generar Código de 8 Dígitos</button>\`
                }
            </div>
        </div>
        <script>
            function generarCodigoTxt(){
                const num = document.getElementById('num_club').value;
                const btn = document.getElementById('btn-disparar');
                if(!num) { alert("Por favor, ingrese un número."); return; }
                btn.disabled = true; btn.innerText = "Solicitando...";
                fetch('/solicitar-codigo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ numero: num })
                })
                .then(r => r.json())
                .then(res => {
                    if(res.status === 'ok') {
                        document.getElementById('txt-estado').innerText = "Esperando código en tu teléfono";
                        document.getElementById('contenedor-dinamico').innerHTML = \`
                            <div style="font-size:2.8rem; font-weight:bold; color:#fff; background:#222; padding:15px; border-radius:6px; letter-spacing:4px; margin:20px 0; border:2px dashed #d4af37;">\${res.codigo}</div>
                            <p style="text-align:left; font-size:0.95rem; color:#ccc; line-height:1.5;">
                                <b>Instrucciones para enlazar en tu celular:</b><br>
                                1. Abre WhatsApp en tu teléfono.<br>
                                2. Ve a <b>Dispositivos vinculados > Vincular un dispositivo</b>.<br>
                                3. Selecciona <b>Vincular con el número de teléfono de todas formas</b>.<br>
                                4. Introduce este código de 8 letras.
                            </p>\`;
                        setInterval(chequearEstadoInvisble, 4000);
                    } else { alert("Error al generar. Intente de nuevo."); btn.disabled = false; btn.innerText = "Generar Código"; }
                }).catch(() => { btn.disabled = false; btn.innerText = "Generar Código"; });
            }
            function chequearEstadoInvisble(){
                fetch('/estado-conexion').then(r=>r.json()).then(d=>{
                    if(d.estado === "Conectado Exitosamente"){
                        document.getElementById('txt-estado').innerText = "Conectado Exitosamente";
                        document.getElementById('contenedor-dinamico').innerHTML = '<h2 style="color:#2ecc71">✔️ Tu servidor está en línea y enlazado de forma real.</h2>';
                    }
                });
            }
        </script>
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

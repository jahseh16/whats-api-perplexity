const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@itsliaaa/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const express = require('express');

const app = express();
app.use(express.json());

let sock;

async function startWhatsApp() {
    // Guarda la sesión en la carpeta 'session_auth'
    const { state, saveCreds } = await useMultiFileAuthState('session_auth');

    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('--- ESCANEA ESTE QR CON TU CELULAR ---');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWhatsApp();
        } else if (connection === 'open') {
            console.log('¡WhatsApp conectado exitosamente en el VPS!');
        }
    });

    // Escucha de mensajes (Tu Bot)
    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.key.fromMe && m.type === 'notify') {
            const from = msg.key.remoteJid;
            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

            // Comando de prueba sencillo
            if (text && text.toLowerCase() === 'ping') {
                await sock.sendMessage(from, { text: 'pong 🚀' });
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// ENDPOINT API: Para enviar mensajes desde Perplexity o tu Web
app.post('/api/send', async (req, res) => {
    const { to, message } = req.body; // 'to' debe ser ej: "51912345678"

    if (!sock) return res.status(500).json({ error: 'Bot no iniciado' });

    try {
        const jid = `${to}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: message });
        res.status(200).json({ success: true, message: 'Mensaje enviado' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`API activa en el puerto ${PORT}`);
    startWhatsApp();
});

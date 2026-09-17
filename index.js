const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const cron = require('node-cron');

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n--- පහත QR CODE එක SCAN කරන්න ---\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('සම්බන්ධතාවය බිඳ වැටුණි. නැවත සම්බන්ධ වෙමින්...');
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ WhatsApp Bot සාර්ථකව සම්බන්ධ විය!');
        }
    });

    // =========================================================
    // SCHEDULED MESSAGES (තනියම උදේට/රෑට යන ඒවා)
    // =========================================================
    const targetJid = '120363429674680583@g.us'; // ඔයාගේ Group JID එක මෙතැනට දාන්න

    // උදේ 6:00
    cron.schedule('0 6 * * *', async () => {
        const examDate = new Date(2026, 11, 1); 
        const today = new Date();
        const timeDifference = examDate.getTime() - today.getTime();
        const daysLeft = Math.ceil(timeDifference / (1000 * 3600 * 24));

        const morningMsg = `🌅 *සුබ උදෑසනක් හැමෝටම!* ☀️\n\n` +
                           `📌 O/L විභාගයට තව *දින ${daysLeft}යි* තියෙන්නේ!\n` +
                           `අද දවසේත් වැඩ ටික පිළිවෙලට කරගෙන යමු! 💪🔥`;

        try { await sock.sendMessage(targetJid, { text: morningMsg }); } catch (e) {}
    }, { timezone: "Asia/Colombo" });

    // රෑ 10:00
    cron.schedule('0 22 * * *', async () => {
        const nightMsg = `🌙 *Good Night හැමෝටම!* 😴\n\nඅද දවසේ වැඩ ටික ඉවර කරලා හොඳට නිදාගන්න. ✨`;
        try { await sock.sendMessage(targetJid, { text: nightMsg }); } catch (e) {}
    }, { timezone: "Asia/Colombo" });


    // =========================================================
    // COMMAND RESPONSES (.tagall, .ol, .menu, .myid etc.)
    // =========================================================
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const isGroup = from.endsWith('@g.us');

        // 1. Group / Chat ID
        if (text.toLowerCase() === '.myid') {
            await sock.sendMessage(from, { text: `📍 *මෙම Chat/Group එකේ ID එක:* \n\`${from}\`` }, { quoted: msg });
        }

        // 2. Menu
        else if (text.toLowerCase() === '.menu' || text.toLowerCase() === '.help') {
            const menuText = `🤖 *PLAY OF RASIYA BOT MENU* 🤖\n\n` +
                             `• *.ping* - Bot active ද බලන්න\n` +
                             `• *.ol* - O/L Countdown එක බලන්න\n` +
                             `• *.myid* - Group JID එක බලාගන්න\n` +
                             `• *.tagall* - Group එකේ හැමෝම Tag කරන්න\n` +
                             `• *.admins* - Admins ලා විතරක් Tag කරන්න\n` +
                             `• *.groupinfo* - Group විස්තර බලන්න`;
            await sock.sendMessage(from, { text: menuText }, { quoted: msg });
        }

        // 3. Ping
        else if (text.toLowerCase() === '.ping') {
            await sock.sendMessage(from, { text: 'Pong! 🏓 Bot වැඩ.' }, { quoted: msg });
        }

        // 4. Tag All (Group Only)
        else if (isGroup && (text.toLowerCase() === '.tagall' || text.toLowerCase() === '.everyone')) {
            const groupMetadata = await sock.groupMetadata(from);
            let mentions = [];
            let responseText = `📢 *Attention Everyone! (${groupMetadata.participants.length})*\n\n`;

            for (let mem of groupMetadata.participants) {
                responseText += `@${mem.id.split('@')[0]}\n`;
                mentions.push(mem.id);
            }
            await sock.sendMessage(from, { text: responseText, mentions: mentions }, { quoted: msg });
        }

        // 5. O/L Countdown
        else if (text.toLowerCase() === '.ol' || text.toLowerCase() === '.exam') {
            const examDate = new Date(2026, 11, 1); 
            const today = new Date();
            const timeDifference = examDate.getTime() - today.getTime();
            const daysLeft = Math.ceil(timeDifference / (1000 * 3600 * 24));

            let responseText = daysLeft > 0 
                ? `🎯 *O/L Exam Countdown*\n\n📅 O/L විභාගයට තව *දින ${daysLeft}ක්* තියෙනවා!\n\n💪 හොඳින් පාඩම් කරන්න. Good Luck! ✨`
                : `🎉 *O/L විභාගය අවසන් වී ඇත / පැවැත්වේ!*`;

            await sock.sendMessage(from, { text: responseText }, { quoted: msg });
        }

        // 6. Admins Tag
        else if (isGroup && (text.toLowerCase() === '.admins' || text.toLowerCase() === '.admin')) {
            const groupMetadata = await sock.groupMetadata(from);
            const admins = groupMetadata.participants.filter(p => p.admin !== null);
            let mentions = [];
            let responseText = `👑 *Group Admins List*\n\n`;

            for (let admin of admins) {
                responseText += `@${admin.id.split('@')[0]}\n`;
                mentions.push(admin.id);
            }
            await sock.sendMessage(from, { text: responseText, mentions: mentions }, { quoted: msg });
        }

        // 7. Group Info
        else if (isGroup && text.toLowerCase() === '.groupinfo') {
            const groupMetadata = await sock.groupMetadata(from);
            const infoText = `📌 *Group Info*\n\n👥 *Name:* ${groupMetadata.subject}\n👨‍👩‍👧‍👦 *Members:* ${groupMetadata.participants.length}`;
            await sock.sendMessage(from, { text: infoText }, { quoted: msg });
        }
    });
}

startBot();
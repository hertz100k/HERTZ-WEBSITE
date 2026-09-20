require("dotenv").config();

const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require("@discordjs/voice");
const express = require("express");

const VISIT_CHANNEL_ID = "1549529917757325322"; // شانل البيانات الجديدة (DATA-NEW)
const OLD_DATA_CHANNEL_ID = "1549530385908506694"; // شانل البيانات القديمة (DATA-OLD)
const TRASH_CHANNEL_ID = "1549530638627897385"; // شانل سلة المهملات (RECYCLE-BIN)
const TARGET_VOICE_CHANNEL_ID = "1550379501714808893"; // أيدي القناة الصوتية المطلوبة

// 🛡️ [حماية البوت القصوى]: ضع الـ Discord User ID الخاص بك هنا عندما تحصل عليه
const OWNER_ID = process.env.OWNER_ID || "1351941644714250422";

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// تتبع وقت التواجد في الفويس (هدف مفتوح بلا توقف)
const TARGET_HOURS = 1000;
const TARGET_MILLISECONDS = TARGET_HOURS * 60 * 60 * 1000;
let voiceSessionStartTime = null;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates // ضروري جداً لتفاعل البوت مع الفويس
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction
    ]
});

let currentConnection = null;

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
    const uptimeHours = voiceSessionStartTime ? ((Date.now() - voiceSessionStartTime) / (1000 * 60 * 60)).toFixed(2) : 0;
    res.send(`HERTZ ADMIN BOT is running 24/7. | Voice Active Hours: ${uptimeHours} / ${TARGET_HOURS}h`);
});

// استقبال الـ Webhook بدون إرسال أي تنبيهات في القناة
app.post("/visit", async (req, res) => {
    try {
        const receivedSecret = req.headers["x-hertz-webhook-secret"];

        if (!WEBHOOK_SECRET) {
            console.error("❌ WEBHOOK_SECRET is not configured.");
            return res.status(500).send("Server configuration error.");
        }

        if (receivedSecret !== WEBHOOK_SECRET) {
            console.log("❌ Unauthorized webhook request.");
            return res.status(401).send("Unauthorized.");
        }

        console.log("📥 New visit received (Silent mode active).");
        res.status(200).send("OK");

    } catch (error) {
        console.error("❌ Visit webhook error:", error);
        res.status(500).send("Error");
    }
});

// دالة تثبيت البوت داخل الفويس بشكل دائم وبدون انقطاع نهائي
async function connectToVoiceChannel() {
    try {
        const channel = await client.channels.fetch(TARGET_VOICE_CHANNEL_ID);
        if (!channel || channel.type !== 2) {
            console.log("❌ القناة الصوتية المطلوبة غير موجودة أو ليست قناة صوتية.");
            return;
        }

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });

        currentConnection = connection;

        connection.on(VoiceConnectionStatus.Ready, () => {
            if (!voiceSessionStartTime) {
                voiceSessionStartTime = Date.now();
            }
            console.log(`🔊 [استقرار دائم]: البوت دخل واستقر في الفويس بنجاح ولن يخرج نهائياً: ${channel.name}`);
        });

        // التعامل الفوري مع أي انقطاع وإعادة الدخول خلال أجزاء من الثانية
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await entersState(connection, VoiceConnectionStatus.Signalling, 1_000);
            } catch (error) {
                try {
                    connection.destroy();
                } catch (e) {}
                console.log("🔄 تم رصد قطع اتصال، جاري إعادة دخول الفويس فوراً...");
                setTimeout(connectToVoiceChannel, 200);
            }
        });

        connection.on('error', (error) => {
            try {
                connection.destroy();
            } catch (e) {}
            setTimeout(connectToVoiceChannel, 200);
        });

    } catch (error) {
        console.error("❌ خطأ أثناء محاولة دخول الفويس:", error);
        setTimeout(connectToVoiceChannel, 1000);
    }
}

// نظام منع توقف أو انهيار السيرفر أو البوت نهائياً تحت أي ظرف (Anti-Crash)
process.on('unhandledRejection', (error) => {
    console.error('⚠️ تحذير (Unhandled Rejection):', error);
});
process.on('uncaughtException', (error) => {
    console.error('⚠️ خطأ فادح تم تجاوزه (Uncaught Exception):', error);
});

// --- نظام جلب الـ ID التلقائي ومعرفة المالك ---
client.on('messageCreate', (message) => {
    if (message.author.bot) return;
    console.log(`👤 رسالة من: ${message.author.tag} | 🆔 الـ ID الخاص به هو: ${message.author.id}`);
});

// --- التعامل مع الرياكتات وتحصينها بحماية Owner-Only ---
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;

    if (reaction.partial) {
        try { await reaction.fetch(); } catch (error) { return; }
    }
    if (reaction.message.partial) {
        try { await reaction.message.fetch(); } catch (error) { return; }
    }

    const message = reaction.message;
    const emoji = reaction.emoji.name;
    const msgContent = message.content || "";
    const msgEmbeds = message.embeds;

    if (emoji === '✅') {
        if (message.channel.id === VISIT_CHANNEL_ID) {
            try { await message.delete(); } catch (error) { return; }

            const oldChannel = await client.channels.fetch(OLD_DATA_CHANNEL_ID).catch(() => null);
            if (oldChannel) {
                await oldChannel.send({ content: msgContent, embeds: msgEmbeds });
            }
        }
        else if (message.channel.id === OLD_DATA_CHANNEL_ID) {
            try { await reaction.users.remove(user.id); } catch (error) {}
            return;
        }
        else if (message.channel.id === TRASH_CHANNEL_ID) {
            try { await message.delete(); } catch (error) { return; }

            const oldChannel = await client.channels.fetch(OLD_DATA_CHANNEL_ID).catch(() => null);
            if (oldChannel) {
                await oldChannel.send({ content: msgContent, embeds: msgEmbeds });
            }
        }
    }
    else if (emoji === '❌') {
        // --- 🛡️ [حماية صارمة جداً للأوامر الحساسة والحظر]: ---
        if (USER_ID_CHECK(user.id)) {
            // سيتم حظره برمجياً من التخريب
        }

        if (user.id !== OWNER_ID && OWNER_ID !== "ضع_الايدي_هنا_مؤقتاً") {
            console.log(`⚠️ [محاولة اختراق/عبث مرفوضة]: المستخدم ${user.tag} (${user.id}) حاول استخدام تفاعل الحظر/الحذف.`);
            try {
                await reaction.users.remove(user.id);
            } catch (err) {}
            return;
        }
        // --------------------------------------------------

        if (message.channel.id === TRASH_CHANNEL_ID) return;

        if (message.channel.id === VISIT_CHANNEL_ID || message.channel.id === OLD_DATA_CHANNEL_ID) {
            try { await message.delete(); } catch (error) { return; }

            const trashChannel = await client.channels.fetch(TRASH_CHANNEL_ID).catch(() => null);
            if (trashChannel) {
                await trashChannel.send({ content: msgContent, embeds: msgEmbeds });
            }

            try {
                const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
                await fetch('https://inspiring-adventure-production-368b.up.railway.app/visit', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Hertz-Webhook-Secret': process.env.WEBHOOK_SECRET
                    },
                    body: JSON.stringify({ visit_id: 999999, action: 'ban' })
                });
            } catch (error) {
                console.error('❌ خطأ أثناء إرسال طلب الحظر:', error);
            }
        }
    }
});

// دالة مساعدة للتحقق
function USER_ID_CHECK(id) {
    return id === OWNER_ID;
}

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Webhook server running on port ${PORT}`);
});

client.once("ready", () => {
    console.log(`✅ البوت اشتغل بنجاح باسم ${client.user.tag}`);
    connectToVoiceChannel();

    // فحص دوري صارم كل 10 ثوانٍ لضمان بقاء البوت في الفويس مهما حدث
    setInterval(async () => {
        try {
            if (!currentConnection || currentConnection.state.status === VoiceConnectionStatus.Disconnected || currentConnection.state.status === VoiceConnectionStatus.Destroyed) {
                console.log("⚠️ تم رصد خروج أو قطع بالفويس، جاري إعادة إدخال البوت فوراً...");
                connectToVoiceChannel();
            }
        } catch (e) {
            connectToVoiceChannel();
        }
    }, 10 * 1000);
});

client.login(process.env.DISCORD_TOKEN)
    .catch((error) => {
        console.error("❌ فشل تسجيل الدخول إلى Discord:", error);
    });

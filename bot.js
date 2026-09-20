require("dotenv").config();

const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require("@discordjs/voice");
const express = require("express");

const VISIT_CHANNEL_ID = "1549529917757325322";
const OLD_DATA_CHANNEL_ID = "1549530385908506694";
const TRASH_CHANNEL_ID = "1549530638627897385";
const TARGET_VOICE_CHANNEL_ID = "1550379501714808893";

const AUTHORIZED_ROLE_ID = "1550641497173659778";

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

const TARGET_HOURS = 1000;
const TARGET_MILLISECONDS = TARGET_HOURS * 60 * 60 * 1000;
let voiceSessionStartTime = null;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.GuildMember,
        Partials.User
    ]
});

let currentConnection = null;

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
    const uptimeHours = voiceSessionStartTime ? ((Date.now() - voiceSessionStartTime) / (1000 * 60 * 60)).toFixed(2) : 0;
    res.send(`HERTZ ADMIN BOT is running 24/7. | Voice Active Hours: ${uptimeHours} / ${TARGET_HOURS}h`);
});

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
            console.log(`🔊 [استقرار دائم]: البوت دخل واستقر في الفويس بنجاح: ${channel.name}`);
        });

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await entersState(connection, VoiceConnectionStatus.Signalling, 1_000);
            } catch (error) {
                try { connection.destroy(); } catch (e) {}
                console.log("🔄 تم رصد قطع اتصال، جاري إعادة دخول الفويس فوراً...");
                setTimeout(connectToVoiceChannel, 200);
            }
        });

        connection.on('error', (error) => {
            try { connection.destroy(); } catch (e) {}
            setTimeout(connectToVoiceChannel, 200);
        });
    } catch (error) {
        console.error("❌ خطأ أثناء محاولة دخول الفويس:", error);
        setTimeout(connectToVoiceChannel, 1000);
    }
}

process.on('unhandledRejection', (error) => {
    console.error('⚠️ تحذير (Unhandled Rejection):', error);
});
process.on('uncaughtException', (error) => {
    console.error('⚠️ خطأ فادح تم تجاوزه (Uncaught Exception):', error);
});

client.on('messageCreate', (message) => {
    if (message.author.bot) return;
    console.log(`👤 رسالة من: ${message.author.tag} | 🆔 الـ ID: ${message.author.id}`);
});

// ============================================================
// 🛡️ دالة التحقق — سريعة (بدون force fetch)
// ============================================================
function isAuthorizedFast(message, userId) {
    try {
        // محاولة من الكاش أولاً (سريع جدًا)
        let member = message.guild.members.cache.get(userId);

        if (!member) {
            // لو مش في الكاش، نرجع false فورًا ونخلي البوت يجيبه في الخلفية
            message.guild.members.fetch(userId).catch(() => {});
            return false;
        }

        return member.roles.cache.has(AUTHORIZED_ROLE_ID);
    } catch (err) {
        return false;
    }
}

// ============================================================
// 🎯 نظام الريأكتات (سريع)
// ============================================================
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;

    // ⚡ التحقق الفوري من الرول (من الكاش — سريع جدًا)
    const message = reaction.message;
    if (!message.guild) return;

    // ⚠️ فلتر سريع: هل الرسالة في أحد التشانلات الثلاثة؟
    const isTargetChannel =
        message.channelId === VISIT_CHANNEL_ID ||
        message.channelId === OLD_DATA_CHANNEL_ID ||
        message.channelId === TRASH_CHANNEL_ID;

    if (!isTargetChannel) return;

    // 🛡️ التحقق من الرول فورًا من الكاش
    const authorized = isAuthorizedFast(message, user.id);

    if (!authorized) {
        console.log(`⚠️ [مرفوض]: ${user.tag} — يتم إزالة الريأكت`);
        try { await reaction.users.remove(user.id); } catch (err) {}
        return;
    }

    // ⚡ دلوقتي نجهز الرسالة (لو كانت partial)
    if (reaction.partial) {
        try { await reaction.fetch(); } catch (error) { return; }
    }
    if (reaction.message.partial) {
        try { await reaction.message.fetch(); } catch (error) { return; }
    }

    const emoji = reaction.emoji.name;
    const msgContent = message.content || "";
    const msgEmbeds = message.embeds;

    // ✅ في البيانات الجديدة → البيانات القديمة
    if (emoji === '✅') {
        if (message.channelId === VISIT_CHANNEL_ID) {
            try { await message.delete(); } catch (error) { return; }
            const oldChannel = await client.channels.fetch(OLD_DATA_CHANNEL_ID).catch(() => null);
            if (oldChannel) {
                await oldChannel.send({ content: msgContent, embeds: msgEmbeds });
            }
            console.log("✅ [DATA-NEW] → [DATA-OLD]");
        }
        else if (message.channelId === OLD_DATA_CHANNEL_ID) {
            try { await reaction.users.remove(user.id); } catch (error) {}
            return;
        }
        else if (message.channelId === TRASH_CHANNEL_ID) {
            try { await message.delete(); } catch (error) { return; }
            const oldChannel = await client.channels.fetch(OLD_DATA_CHANNEL_ID).catch(() => null);
            if (oldChannel) {
                await oldChannel.send({ content: msgContent, embeds: msgEmbeds });
            }
            console.log("✅ [TRASH] → [DATA-OLD]");
        }
    }
    // ❌ في أي مكان
    else if (emoji === '❌') {
        if (message.channelId === VISIT_CHANNEL_ID || message.channelId === OLD_DATA_CHANNEL_ID) {
            try { await message.delete(); } catch (error) { return; }
            const trashChannel = await client.channels.fetch(TRASH_CHANNEL_ID).catch(() => null);
            if (trashChannel) {
                await trashChannel.send({ content: msgContent, embeds: msgEmbeds });
            }
            console.log("❌ → [TRASH]");
        }
        else if (message.channelId === TRASH_CHANNEL_ID) {
            try { await reaction.users.remove(user.id); } catch (err) {}
            console.log("❌ [TRASH] → تم إزالة الريأكت");
            return;
        }
    }
});

// ============================================================
// 🚀 عند جاهزية البوت — نجيب كل الأعضاء في الكاش مسبقًا
// ============================================================
client.once("ready", async () => {
    console.log(`✅ البوت اشتغل بنجاح باسم ${client.user.tag}`);

    // 🚀 جلب كل الأعضاء مسبقًا عشان السرعة
    try {
        const guilds = client.guilds.cache;
        for (const [guildId, guild] of guilds) {
            console.log(`🔄 جلب أعضاء السيرفر: ${guild.name}`);
            await guild.members.fetch();
            console.log(`✅ تم جلب ${guild.memberCount} عضو`);
        }
    } catch (err) {
        console.error("❌ خطأ أثناء جلب الأعضاء:", err);
    }

    connectToVoiceChannel();

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

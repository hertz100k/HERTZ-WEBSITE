require("dotenv").config();

const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require("@discordjs/voice");
const { createClient } = require("@supabase/supabase-js");
const express = require("express");

// ============================================================
// تعريف الآيبيهات الجديدة للقنوات والخزائن
// ============================================================
const SUPPORT_CHANNEL_ID = "1549573975640637450";          // قناة دعم الموقع
const ORDER_CHANNEL_ID = "1552304716434645032";          // قناة طلب الأوردر
const CANCEL_CHANNEL_ID = "1552295251182493726";         // قناة إلغاء الأوردر

const TRASH_SUPPORT_CHANNEL_ID = "1549529917757325322";  // خزنة دعم الموقع
const TRASH_ORDER_CHANNEL_ID = "1549530385908506694";    // خزنة طلب الأوردر
const TRASH_CANCEL_CHANNEL_ID = "1549530638627897385";   // خزنة إلغاء الأوردر

const TARGET_VOICE_CHANNEL_ID = "1550379501714808893";   // قناة الفويس (24 ساعة)
const AUTHORIZED_ROLE_ID = "1550641497173659778";

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const TARGET_HOURS = 1000;
let voiceSessionStartTime = null;

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// ============================================================
// Discord Client
// ============================================================
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
        Partials.Message, Partials.Channel, Partials.Reaction,
        Partials.GuildMember, Partials.User
    ]
});

let currentConnection = null;

// ============================================================
// Express Server
// ============================================================
const app = express();
app.use(express.json());

app.get("/", (req, res) => {
    const uptimeHours = voiceSessionStartTime ? ((Date.now() - voiceSessionStartTime) / (1000 * 60 * 60)).toFixed(2) : 0;
    res.send(`HERTZ ADMIN BOT is running. | Voice: ${uptimeHours}h / ${TARGET_HOURS}h`);
});

// ============================================================
// نظام الريأكتات المخصص (للنقل للخزائن بـ ✅ فقط)
// ============================================================
function isAuthorizedFast(message, userId) {
    try {
        let member = message.guild.members.cache.get(userId);
        if (!member) {
            message.guild.members.fetch(userId).catch(() => {});
            return false;
        }
        return member.roles.cache.has(AUTHORIZED_ROLE_ID);
    } catch (err) {
        return false;
    }
}

client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    const message = reaction.message;
    if (!message.guild) return;

    // التحقق هل الرسالة في إحدى القنوات الثلاثة المستهدفة
    const isTargetChannel =
        message.channelId === SUPPORT_CHANNEL_ID ||
        message.channelId === ORDER_CHANNEL_ID ||
        message.channelId === CANCEL_CHANNEL_ID;
    
    if (!isTargetChannel) return;

    const authorized = isAuthorizedFast(message, user.id);
    if (!authorized) {
        try { await reaction.users.remove(user.id); } catch (err) {}
        return;
    }

    if (reaction.partial) {
        try { await reaction.fetch(); } catch (error) { return; }
    }
    if (message.partial) {
        try { await message.fetch(); } catch (error) { return; }
    }

    const emoji = reaction.emoji.name;
    const msgContent = message.content || "";
    const msgEmbeds = message.embeds;

    // العمل فقط عند استخدام علامة الصح ✅
    if (emoji === '✅') {
        if (message.channelId === SUPPORT_CHANNEL_ID) {
            try { await message.delete(); } catch (error) {}
            const targetVault = await client.channels.fetch(TRASH_SUPPORT_CHANNEL_ID).catch(() => null);
            if (targetVault) {
                await targetVault.send({ content: msgContent, embeds: msgEmbeds });
            }
            console.log("✅ دعم الموقع → خزنة دعم الموقع");
        } 
        else if (message.channelId === ORDER_CHANNEL_ID) {
            try { await message.delete(); } catch (error) {}
            const targetVault = await client.channels.fetch(TRASH_ORDER_CHANNEL_ID).catch(() => null);
            if (targetVault) {
                await targetVault.send({ content: msgContent, embeds: msgEmbeds });
            }
            console.log("✅ طلب الأوردر → خزنة طلب الأوردر");
        } 
        else if (message.channelId === CANCEL_CHANNEL_ID) {
            try { await message.delete(); } catch (error) {}
            const targetVault = await client.channels.fetch(TRASH_CANCEL_CHANNEL_ID).catch(() => null);
            if (targetVault) {
                await targetVault.send({ content: msgContent, embeds: msgEmbeds });
            }
            console.log("✅ إلغاء الأوردر → خزنة إلغاء الأوردر");
        }
    }
});

// ============================================================
// الاتصال الدائم بالفويس
// ============================================================
async function connectToVoiceChannel() {
    try {
        const channel = await client.channels.fetch(TARGET_VOICE_CHANNEL_ID);
        if (!channel || channel.type !== 2) {
            console.log("❌ القناة الصوتية غير موجودة أو ليست قناة صوتية");
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
            if (!voiceSessionStartTime) voiceSessionStartTime = Date.now();
            console.log(`🔊 دخل الفويس بنجاح: ${channel.name}`);
        });

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await entersState(connection, VoiceConnectionStatus.Signalling, 1_000);
            } catch (error) {
                try { connection.destroy(); } catch (e) {}
                console.log("🔄 إعادة الاتصال بالفويس...");
                setTimeout(connectToVoiceChannel, 200);
            }
        });

        connection.on('error', (error) => {
            try { connection.destroy(); } catch (e) {}
            setTimeout(connectToVoiceChannel, 200);
        });
    } catch (error) {
        console.error("❌ Voice Error:", error);
        setTimeout(connectToVoiceChannel, 1000);
    }
}

// ============================================================
// Ready Event
// ============================================================
client.once("ready", async () => {
    console.log(`✅ البوت اشتغل بنجاح: ${client.user.tag}`);
    console.log(`🌐 Port ${PORT}`);

    connectToVoiceChannel();

    setInterval(async () => {
        try {
            if (!currentConnection || currentConnection.state.status === VoiceConnectionStatus.Disconnected || currentConnection.state.status === VoiceConnectionStatus.Destroyed) {
                console.log("⚠️ إعادة تفعيل اتصال الفويس...");
                connectToVoiceChannel();
            }
        } catch (e) {
            connectToVoiceChannel();
        }
    }, 10 * 1000);
});

process.on('unhandledRejection', (error) => {
    console.error('⚠️ Unhandled:', error);
});
process.on('uncaughtException', (error) => {
    console.error('⚠️ Uncaught:', error);
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Server Port ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN)
    .catch((error) => {
        console.error("❌ Login Error:", error);
    });

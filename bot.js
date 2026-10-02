require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    Partials,
    ChannelType,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");
const {
    joinVoiceChannel,
    entersState,
    VoiceConnectionStatus
} = require("@discordjs/voice");
const express = require("express");

// ============================================================
// الآي ديهات الجديدة
// ============================================================
const VOICE_CHANNEL_ID = "1555278659194196008"; // قناة البوت الصوتية
const GENERAL_CHAT_ID  = "1555278706056892516"; // الشات العام
const MUSIC_CHAT_ID    = "1555278707055267860"; // شات الميوزك

const ROLE_1_ID = "1555278590009151598"; // الرول الأولى
const ROLE_2_ID = "1555278591170838528"; // الرول الثانية
const ROLE_3_ID = "1555278592206839933"; // الرول الثالثة
const AUTO_ROLE_ID = "1555278602407510140"; // الرول التلقائية

const PORT = process.env.PORT || 3000;
const TARGET_HOURS = 1000;
let voiceSessionStartTime = null;

// ============================================================
// إعدادات الحماية
// ============================================================
const PROTECTED_CHANNELS = [GENERAL_CHAT_ID, MUSIC_CHAT_ID]; // الرومات المحمية
const EXEMPT_ROLES = [ROLE_1_ID, ROLE_2_ID, ROLE_3_ID]; // معفيين من الحماية
const CLEAR_ALLOWED_ROLES = [ROLE_1_ID, ROLE_2_ID, ROLE_3_ID]; // مسموح لهم بالكلير

const SPAM_THRESHOLD = 5;                       // 5 رسايل
const SPAM_TIME_WINDOW = 5 * 1000;              // خلال 5 ثواني
const SPAM_TIMEOUT_DURATION = 15 * 60 * 1000;   // تايم أوت 15 دقيقة

const LINK_STRIKE_LIMIT = 5;                    // 5 مرات لينك
const LINK_TIMEOUT_DURATION = 15 * 60 * 1000;   // تايم أوت 15 دقيقة
const LINK_STRIKE_RESET = 15 * 60 * 1000;       // تصفير العدادات بعد 15 دقيقة سكوت

// ============================================================
// متغيرات عامة
// ============================================================
const linkStrikeMap = new Map();    // userId -> { count, lastTime }
const messageSpamMap = new Map();   // userId -> { count, lastTime, messageIds }
const clearProcessing = new Set();
let currentConnection = null;

// ============================================================
// Discord Client
// ============================================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.GuildMember,
        Partials.User
    ]
});

// ============================================================
// Express
// ============================================================
const app = express();
app.use(express.json());

app.get("/", (req, res) => {
    const uptimeHours = voiceSessionStartTime
        ? ((Date.now() - voiceSessionStartTime) / 3600000).toFixed(2)
        : 0;
    res.send(`BOT is running. | Voice: ${uptimeHours}h / ${TARGET_HOURS}h`);
});

// ============================================================
// Helpers
// ============================================================
async function getMember(guild, userId) {
    try {
        let m = guild.members.cache.get(userId);
        if (!m) m = await guild.members.fetch(userId);
        return m;
    } catch {
        return null;
    }
}

async function hasAnyRole(guild, userId, roleIds) {
    const member = await getMember(guild, userId);
    if (!member) return false;
    return member.roles.cache.some(r => roleIds.includes(r.id));
}

// ============================================================
// AUTO ROLE عند دخول أي عضو
// ============================================================
client.on("guildMemberAdd", async (member) => {
    try {
        if (!member || member.user.bot) return;
        await member.roles.add(AUTO_ROLE_ID, "رول تلقائي عند الدخول");
        console.log(`✅ [AUTO ROLE] تم إعطاء الرول التلقائي لـ ${member.user.tag}`);
    } catch (err) {
        console.error("❌ [AUTO ROLE]", err.message);
    }
});

// ============================================================
// حماية الروابط + السبام (الشات العام + الميوزك فقط)
// ============================================================
client.on("messageCreate", async (message) => {
    try {
        if (message.author.bot || !message.guild) return;

        // تطبيق الحماية على الشات العام والميوزك فقط
        if (!PROTECTED_CHANNELS.includes(message.channelId)) return;

        const userId = message.author.id;

        // لو معاه رول 1 أو 2 أو 3 → ممنوع يتأثر بأي حماية
        const exempt = await hasAnyRole(message.guild, userId, EXEMPT_ROLES);
        if (exempt) return;

        const now = Date.now();

        // ============================================================
        // 1) حماية الروابط
        // ============================================================
        const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9][-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*))/gi;

        if (linkRegex.test(message.content)) {
            // حذف الرسالة تلقائياً
            await message.delete().catch(() => {});

            // عدّاد اللينك للعضو
            let rec = linkStrikeMap.get(userId);
            if (!rec || now - rec.lastTime > LINK_STRIKE_RESET) {
                rec = { count: 0, lastTime: now };
            }
            rec.count += 1;
            rec.lastTime = now;
            linkStrikeMap.set(userId, rec);

            console.log(`🔗 [LINK] ${message.author.tag} - محاولة رقم ${rec.count}`);

            // لو وصل للخامسة → تايم أوت 15 دقيقة
            if (rec.count >= LINK_STRIKE_LIMIT) {
                try {
                    const member = await message.guild.members.fetch(userId);
                    if (member.moderatable) {
                        await member.timeout(LINK_TIMEOUT_DURATION, "نشر روابط 5 مرات");
                    }
                    linkStrikeMap.delete(userId);

                    const warn = await message.channel.send(
                        `⛔ ${message.author} تم إعطاؤك **تايم أوت 15 دقيقة** بسبب نشر الروابط 5 مرات.`
                    );
                    setTimeout(() => warn.delete().catch(() => {}), 7000);

                    console.log(`🚫 [LINK TIMEOUT] ${message.author.tag}`);
                } catch (e) {
                    console.error("❌ [LINK TIMEOUT]", e.message);
                }
            }
            return; // خلصنا معالجة الرسالة
        }

        // ============================================================
        // 2) حماية السبام
        // ============================================================
        let spam = messageSpamMap.get(userId);
        if (!spam) {
            spam = { count: 1, lastTime: now, messageIds: [message.id] };
            messageSpamMap.set(userId, spam);
        } else {
            if (now - spam.lastTime < SPAM_TIME_WINDOW) {
                spam.count += 1;
                spam.messageIds.push(message.id);
            } else {
                spam.count = 1;
                spam.messageIds = [message.id];
            }
            spam.lastTime = now;
        }

        if (spam.count >= SPAM_THRESHOLD) {
            // حذف رسائل السبام
            for (const id of spam.messageIds) {
                try {
                    const m = await message.channel.messages.fetch(id).catch(() => null);
                    if (m) await m.delete().catch(() => {});
                } catch {}
            }

            try {
                const member = await message.guild.members.fetch(userId);
                if (member.moderatable) {
                    await member.timeout(SPAM_TIMEOUT_DURATION, "سبام رسائل");
                }
                const warn = await message.channel.send(
                    `⛔ ${message.author} تم إعطاؤك **تايم أوت 15 دقيقة** بسبب السبام المتكرر.`
                );
                setTimeout(() => warn.delete().catch(() => {}), 7000);

                console.log(`🚫 [SPAM TIMEOUT] ${message.author.tag}`);
            } catch (e) {
                console.error("❌ [SPAM TIMEOUT]", e.message);
            }

            messageSpamMap.delete(userId);
        }
    } catch (err) {
        console.error("❌ [messageCreate]", err.message);
    }
});

// ============================================================
// Ready Event + تسجيل الأوامر
// ============================================================
client.once("ready", async () => {
    console.log(`\n============================================`);
    console.log(`✅ البوت اشتغل: ${client.user.tag}`);
    console.log(`📋 الروم الصوتي: ${VOICE_CHANNEL_ID}`);
    console.log(`📋 الشات العام: ${GENERAL_CHAT_ID}`);
    console.log(`📋 شات الميوزك: ${MUSIC_CHAT_ID}`);
    console.log(`============================================\n`);

    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

    try {
        const commands = [
            new SlashCommandBuilder()
                .setName("clear")
                .setDescription("حذف عدد معين من الرسائل (للرولات الإدارية فقط)")
                .addIntegerOption(option =>
                    option
                        .setName("count")
                        .setDescription("عدد الرسائل المراد حذفها (1 - 100)")
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(100)
                )
                .toJSON()
        ];

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log("✅ تم تسجيل أمر /clear بنجاح");
    } catch (err) {
        console.error("❌ خطأ في تسجيل الأوامر:", err);
    }

    connectToVoiceChannel();

    setInterval(() => {
        try {
            const status = currentConnection?.state?.status;
            if (
                !currentConnection ||
                status === VoiceConnectionStatus.Disconnected ||
                status === VoiceConnectionStatus.Destroyed
            ) {
                console.log("🔄 [VOICE CHECK] إعادة الاتصال...");
                connectToVoiceChannel();
            }
        } catch {
            connectToVoiceChannel();
        }
    }, 10 * 1000);
});

// ============================================================
// Slash /clear (الرول 1 و 2 و 3 فقط)
// ============================================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "clear") {
        const userId = interaction.user.id;

        if (clearProcessing.has(userId)) {
            return interaction.reply({
                content: "⏳ في عملية مسح جارية بالفعل.",
                ephemeral: true
            });
        }

        clearProcessing.add(userId);

        try {
            const allowed = await hasAnyRole(
                interaction.guild,
                userId,
                CLEAR_ALLOWED_ROLES
            );

            if (!allowed) {
                return interaction.reply({
                    content: "❌ هذا الأمر مخصص للرولات الإدارية فقط.",
                    ephemeral: true
                });
            }

            const count = interaction.options.getInteger("count");
            await interaction.deferReply({ ephemeral: true });

            const deleted = await interaction.channel.bulkDelete(count, true);
            await interaction.editReply({
                content: `✅ تم حذف **${deleted.size}** رسالة بنجاح.`
            });

            console.log(`🧹 [CLEAR] ${interaction.user.tag} حذف ${deleted.size} رسالة`);
        } catch (err) {
            console.error("❌ [CLEAR]", err.message);
            try {
                await interaction.editReply({
                    content: "❌ حدث خطأ أثناء محاولة مسح الرسائل."
                });
            } catch {}
        } finally {
            clearProcessing.delete(userId);
        }
    }
});

// ============================================================
// الاتصال الدائم بالروم الصوتي
// ============================================================
async function connectToVoiceChannel() {
    try {
        const channel = await client.channels
            .fetch(VOICE_CHANNEL_ID)
            .catch(() => null);

        if (!channel || channel.type !== ChannelType.GuildVoice) {
            console.log("❌ [VOICE] القناة غير موجودة أو ليست صوتية");
            setTimeout(connectToVoiceChannel, 5000);
            return;
        }

        if (currentConnection) {
            try { currentConnection.destroy(); } catch {}
            currentConnection = null;
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
            console.log(`✅ [VOICE] البوت اتصل بـ: ${channel.name}`);
        });

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            console.log("⚠️ [VOICE] الاتصال انقطع، جاري إعادة المحاولة...");
            try {
                await entersState(connection, VoiceConnectionStatus.Signalling, 5000);
                await entersState(connection, VoiceConnectionStatus.Connecting, 5000);
            } catch {
                try { connection.destroy(); } catch {}
                setTimeout(connectToVoiceChannel, 1000);
            }
        });

        connection.on(VoiceConnectionStatus.Destroyed, () => {
            console.log("⚠️ [VOICE] الاتصال اتدمر، جاري إعادة الاتصال...");
            setTimeout(connectToVoiceChannel, 1000);
        });

        connection.on("error", (err) => {
            console.error("❌ [VOICE]", err.message);
            try { connection.destroy(); } catch {}
            setTimeout(connectToVoiceChannel, 1000);
        });
    } catch (err) {
        console.error("❌ [VOICE]", err.message);
        setTimeout(connectToVoiceChannel, 2000);
    }
}

// ============================================================
// منع الكراشات
// ============================================================
process.on("unhandledRejection", () => {});
process.on("uncaughtException", () => {});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Server Port ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);

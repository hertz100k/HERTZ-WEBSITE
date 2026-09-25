require("dotenv").config();

const { Client, GatewayIntentBits, Partials, ChannelType, PermissionFlagsBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require("@discordjs/voice");
const { createClient } = require("@supabase/supabase-js");
const express = require("express");
const fs = require("fs");

// ============================================================
// تعريف الآيبيهات
// ============================================================
const SUPPORT_CHANNEL_ID = "1549573975640637450";
const ORDER_CHANNEL_ID = "1552304716434645032";
const CANCEL_CHANNEL_ID = "1552295251182493726";

const TRASH_SUPPORT_CHANNEL_ID = "1549529917757325322";
const TRASH_ORDER_CHANNEL_ID = "1549530385908506694";
const TRASH_CANCEL_CHANNEL_ID = "1549530638627897385";

const TARGET_VOICE_CHANNEL_ID = "1550379501714808893";
const TICKET_VOICE_CHANNEL_ID = "1550631251130581072";
const AUTHORIZED_ROLE_ID = "1550641497173659778";

const WELCOME_CHANNEL_ID = "1550624611937288253";
const LEAVE_CHANNEL_ID = "1552651900736774164";
const AUTO_ROLE_ID = "1550646079475683419";
const WELCOME_IMAGE_URL = "https://raw.githubusercontent.com/titopanel2-oss/tool/main/welcome.gif";
const SERVER_NAME = "co.developer support";
const GUILD_ID = "1549528572037922868";

const GENERAL_RULES_CHANNEL_ID = "1550604801015025756";
const ADMIN_RULES_CHANNEL_ID = "1550655493628895312";

const PORT = process.env.PORT || 3000;
const TARGET_HOURS = 1000;
let voiceSessionStartTime = null;

// ============================================================
// أنظمة منع التكرار
// ============================================================
const movedMessages = new Set();
const processingLocks = new Set();
const sourceMessagesDeleted = new Set();
const vaultMessages = new Set();

// ✅ أقفال منفصلة لكل عضو لمنع تكرار الرسائل
const processingWelcome = new Map(); // guild:member -> timestamp
const processingLeave = new Map();   // guild:member -> timestamp

const clearProcessing = new Set();
const linkSpamMap = new Map();

// ============================================================
// نظام حماية سبام الرسايل
// ============================================================
const messageSpamMap = new Map(); // userId -> { count: number, lastTime: timestamp, warned: boolean }
const SPAM_THRESHOLD = 5; // عدد الرسايل في فترة قصيرة
const SPAM_TIME_WINDOW = 5000; // 5 ثواني
const SPAM_TIMEOUT_DURATION = 10 * 60 * 1000; // 10 دقائق

const SUPABASE_KEY =
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(
    process.env.SUPABASE_URL,
    SUPABASE_KEY
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
// نظام الصلاحيات
// ============================================================
async function isAuthorizedFast(guild, userId) {
    try {
        let member = guild.members.cache.get(userId);
        if (!member) {
            try {
                member = await guild.members.fetch(userId);
            } catch (fetchErr) {
                return false;
            }
        }
        if (!member) return false;
        return member.roles.cache.has(AUTHORIZED_ROLE_ID);
    } catch (err) {
        return false;
    }
}

// ============================================================
// دالة الترحيب (رسالة واحدة فقط)
// ============================================================
async function sendWelcomeMessage(guild, member) {
    if (!guild || !member || !member.user) return;
    if (member.user.bot) return;

    const key = `${guild.id}:${member.id}`;

    // منع التكرار: إذا كانت العملية قيد التنفيذ أو تمت مسبقاً في نفس جلسة البوت
    if (processingWelcome.has(key)) {
        console.log(`⏭️ [WELCOME SKIP] جاري معالجة الترحيب: ${member.user.tag}`);
        return;
    }

    // قفل فوري
    processingWelcome.set(key, Date.now());

    try {
        console.log(`🎉 [WELCOME] ${member.user.tag}`);

        // إضافة الرتبة التلقائية
        try {
            const role = guild.roles.cache.get(AUTO_ROLE_ID);
            if (role) {
                await member.roles.add(role, 'رول تلقائي');
                console.log(`✅ [AUTO ROLE] تمت الإضافة`);
            }
        } catch (roleError) {
            console.error(`❌ [AUTO ROLE]:`, roleError.message);
        }

        const welcomeChannel = await guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
        if (!welcomeChannel) {
            console.error('❌ روم الترحيب غير موجود');
            processingWelcome.delete(key);
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`مرحباً بك في السيرفر`)
            .setDescription(`أهلاً بك يا <@${member.id}> في سيرفر **${SERVER_NAME}**`)
            .setImage(WELCOME_IMAGE_URL)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setTimestamp();

        await welcomeChannel.send({ embeds: [embed] });
        console.log(`✅ [WELCOME] رسالة واحدة فقط\n`);
    } catch (error) {
        console.error(`❌ [WELCOME ERROR]:`, error.message);
    } finally {
        // احتفظ بالقفل لمدة دقيقة لمنع التكرار
        setTimeout(() => processingWelcome.delete(key), 60000);
    }
}

// ============================================================
// دالة المغادرة (رسالة واحدة فقط)
// ============================================================
async function sendLeaveMessage(guild, memberId, memberTag) {
    if (!guild || !memberId) return;

    const key = `${guild.id}:${memberId}`;

    // منع التكرار
    if (processingLeave.has(key)) {
        console.log(`⏭️ [LEAVE SKIP] جاري معالجة المغادرة: ${memberTag}`);
        return;
    }

    // قفل فو��ي
    processingLeave.set(key, Date.now());

    try {
        console.log(`🚪 [LEAVE] ${memberTag}`);

        const leaveChannel = await guild.channels.fetch(LEAVE_CHANNEL_ID).catch(() => null);
        if (!leaveChannel) {
            console.error('❌ روم المغادرة غير موجود');
            processingLeave.delete(key);
            return;
        }

        await leaveChannel.send({ content: `**غادر** <@${memberId}>` });
        console.log(`✅ [LEAVE] رسالة واحدة فقط\n`);
    } catch (error) {
        console.error(`❌ [LEAVE ERROR]:`, error.message);
    } finally {
        // احتفظ بالقفل لمدة دقيقة لمنع التكرار
        setTimeout(() => processingLeave.delete(key), 60000);
    }
}

// ============================================================
// أحداث دخول وخروج الأعضاء (المصدر الوحيد)
// ============================================================
client.on('guildMemberAdd', async (member) => {
    try {
        if (!member || !member.user || member.user.bot) return;
        console.log(`🔔 [EVENT] دخول عضو: ${member.user.tag}`);
        await sendWelcomeMessage(member.guild, member);
    } catch (error) {
        console.error(`❌ [guildMemberAdd ERROR]:`, error.message);
    }
});

client.on('guildMemberRemove', async (member) => {
    try {
        if (!member || !member.user || member.user.bot) return;
        console.log(`🔔 [EVENT] خروج عضو: ${member.user.tag}`);
        await sendLeaveMessage(member.guild, member.id, member.user.tag);
    } catch (error) {
        console.error(`❌ [guildMemberRemove ERROR]:`, error.message);
    }
});

// ============================================================
// نظام النقل الرقابي
// ============================================================
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;

    if (reaction.partial) {
        try { await reaction.fetch(); } catch (error) { return; }
    }
    const message = reaction.message;
    if (message.partial) {
        try { await message.fetch(); } catch (error) { return; }
    }
    if (!message.guild) return;

    const messageId = message.id;

    if (movedMessages.has(messageId)) return;
    if (sourceMessagesDeleted.has(messageId)) return;
    if (processingLocks.has(messageId)) return;

    processingLocks.add(messageId);

    try {
        const isTargetChannel =
            message.channelId === SUPPORT_CHANNEL_ID ||
            message.channelId === ORDER_CHANNEL_ID ||
            message.channelId === CANCEL_CHANNEL_ID;

        if (!isTargetChannel) {
            processingLocks.delete(messageId);
            return;
        }

        const authorized = await isAuthorizedFast(message.guild, user.id);
        if (!authorized) {
            processingLocks.delete(messageId);
            return;
        }

        const emoji = reaction.emoji.name;
        if (emoji !== '✅') {
            processingLocks.delete(messageId);
            return;
        }

        let targetVaultId = null;
        if (message.channelId === SUPPORT_CHANNEL_ID) {
            targetVaultId = TRASH_SUPPORT_CHANNEL_ID;
        } else if (message.channelId === ORDER_CHANNEL_ID) {
            targetVaultId = TRASH_ORDER_CHANNEL_ID;
        } else if (message.channelId === CANCEL_CHANNEL_ID) {
            targetVaultId = TRASH_CANCEL_CHANNEL_ID;
        }

        if (!targetVaultId) {
            processingLocks.delete(messageId);
            return;
        }

        const vaultKey = `${targetVaultId}:${messageId}`;
        if (vaultMessages.has(vaultKey)) {
            processingLocks.delete(messageId);
            return;
        }

        movedMessages.add(messageId);
        vaultMessages.add(vaultKey);

        try {
            const targetVault = await client.channels.fetch(targetVaultId);
            if (!targetVault) {
                movedMessages.delete(messageId);
                vaultMessages.delete(vaultKey);
                processingLocks.delete(messageId);
                return;
            }

            const msgContent = message.content || "";
            const msgEmbeds = message.embeds || [];
            const msgFiles = message.attachments ? Array.from(message.attachments.values()).map(att => att.url) : [];

            await targetVault.send({
                content: `👤 **بواسطة الأدمن:** <@${user.id}>\n📜 **المحتوى المنقول:**\n${msgContent !== "" ? msgContent : "**[مرفقات أو رسالة بدون نص]**"}`,
                embeds: msgEmbeds,
                files: msgFiles
            });

            sourceMessagesDeleted.add(messageId);
            await message.delete().catch(() => {});
            console.log(`✅ [CLEAN MOVE SUCCESS] messageId=${messageId}`);
        } catch (error) {
            console.error(`❌ [MOVE ERROR]:`, error);
            movedMessages.delete(messageId);
            vaultMessages.delete(vaultKey);
        }
    } finally {
        processingLocks.delete(messageId);
    }
});

// ============================================================
// نظام حماية الروابط ونشر القوانين
// ============================================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const userId = message.author.id;
    const isAdmin = await isAuthorizedFast(message.guild, message.author.id);

    // ============================================================
    // نظام حماية سبام الرسايل
    // ============================================================
    if (!isAdmin) {
        const currentTime = Date.now();
        let userSpamData = messageSpamMap.get(userId);

        if (!userSpamData) {
            userSpamData = { count: 1, lastTime: currentTime, warned: false };
            messageSpamMap.set(userId, userSpamData);
        } else {
            // إذا كانت الرسالة في نفس الفترة الزمنية
            if (currentTime - userSpamData.lastTime < SPAM_TIME_WINDOW) {
                userSpamData.count += 1;
            } else {
                // تجاوز الفترة الزمنية، إعادة تعيين العداد
                userSpamData.count = 1;
                userSpamData.warned = false;
            }
            userSpamData.lastTime = currentTime;
        }

        // التحقق من السبام
        if (userSpamData.count >= SPAM_THRESHOLD) {
            try {
                // إعطاء تايم أوت 10 دقائق
                const member = await message.guild.members.fetch(userId);
                await member.timeout(SPAM_TIMEOUT_DURATION, 'سبام رسائل متكرر');
                
                // إرسال رسالة تحذيرية
                const timeoutMsg = await message.channel.send(`⛔ ${message.author}, تم إعطاؤك **تايم أوت لمدة 10 دقائق** بسبب السبام المتكرر.`);
                setTimeout(() => timeoutMsg.delete().catch(() => {}), 7000);

                console.log(`🚫 [SPAM TIMEOUT] ${message.author.tag} تم إعطاؤه تايم أوت لمدة 10 دقائق`);

                // مسح البيانات
                messageSpamMap.delete(userId);
                return;
            } catch (err) {
                console.error('❌ خطأ في إعطاء تايم أوت:', err);
            }
        } else if (userSpamData.count === SPAM_THRESHOLD - 1 && !userSpamData.warned) {
            // إرسال تحذير قبل التايم أوت
            userSpamData.warned = true;
            try {
                const warningMsg = await message.channel.send(`⚠️ ${message.author}, **تحذير!** توقف عن السبام وإلا ستتعرض لتايم أوت.`);
                setTimeout(() => warningMsg.delete().catch(() => {}), 5000);
                console.log(`⚠️ [SPAM WARNING] ${message.author.tag} تحذير من السبام`);
            } catch (err) {
                console.error('❌ خطأ في إرسال التحذير:', err);
            }
        }
    }

    // ============================================================
    // حماية الروابط
    // ============================================================
    const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9][-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*))/gi;

    if (linkRegex.test(message.content)) {
        if (isAdmin) return;

        try {
            await message.delete();

            const currentTime = Date.now();

            let userRecord = linkSpamMap.get(userId) || { count: 0, lastTime: currentTime };

            if (currentTime - userRecord.lastTime < 60000) {
                userRecord.count += 1;
            } else {
                userRecord.count = 1;
            }
            userRecord.lastTime = currentTime;
            linkSpamMap.set(userId, userRecord);

            if (userRecord.count >= 2) {
                try {
                    const member = await message.guild.members.fetch(userId);
                    await member.timeout(60 * 60 * 1000, 'إرسال روابط متكررة ومخالفة لقوانين السيرفر');
                    linkSpamMap.delete(userId);

                    const warningMsg = await message.channel.send(`⚠️ ${message.author}, تم إعطاؤك **تايم أوت لمدة ساعة** بسبب إرسال الروابط المتكررة.`);
                    setTimeout(() => warningMsg.delete().catch(() => {}), 5000);
                    return;
                } catch (err) {
                    console.error('فشل إعطاء تايم أوت للعضو:', err);
                }
            }

            const firstWarning = await message.channel.send(`⚠️ ${message.author}, ممنوع نشر الروابط في السيرفر! التكرار سيؤدي إلى تايم أوت.`);
            setTimeout(() => firstWarning.delete().catch(() => {}), 5000);
            return;

        } catch (error) {
            console.error('خطأ أثناء حذف الرابط:', error);
        }
    }

    // ============================================================
    // نشر القوانين
    // ============================================================
    if (message.content === '!sendrules') {
        try {
            const isAdmin = await isAuthorizedFast(message.guild, message.author.id);
            if (!isAdmin) {
                return message.reply('❌ عذراً، هذا الأمر مخصص للإدارة فقط!');
            }

            let generalRules, adminRules;

            try {
                generalRules = fs.readFileSync('./rules-general.txt', 'utf8');
            } catch (e) {
                return message.reply('❌ ملف `rules-general.txt` غير موجود في مجلد البوت!');
            }

            try {
                adminRules = fs.readFileSync('./rules-admin.txt', 'utf8');
            } catch (e) {
                return message.reply('❌ ملف `rules-admin.txt` غير موجود في مجلد البوت!');
            }

            const generalChannel = message.guild.channels.cache.get(GENERAL_RULES_CHANNEL_ID);
            if (generalChannel) {
                await generalChannel.send(generalRules);
            } else {
                return message.reply('❌ لم أستطع العثور على روم القوانين العامة، تأكد من الآي دي!');
            }

            const adminChannel = message.guild.channels.cache.get(ADMIN_RULES_CHANNEL_ID);
            if (adminChannel) {
                await adminChannel.send(adminRules);
            } else {
                return message.reply('❌ لم أستطع العثور على روم الإدارة، تأكد من الآي دي!');
            }

            message.reply('✅ تم نشر القوانين العامة وقوانين الإدارة بنجاح في روماتها المخصصة!');

        } catch (error) {
            console.error('خطأ في نشر القوانين:', error);
            message.reply('❌ حدث خطأ أثناء قراءة ملفات القوانين، تأكد من وجود ملفات الـ txt في نفس الفولدر.');
        }
    }
});

// ============================================================
// نظام التيكت فويس
// ============================================================
client.on('channelCreate', async (channel) => {
    try {
        if (!channel.guild) return;
        const channelName = channel.name.toLowerCase();
        if (channelName.includes('ticket') || channelName.includes('تيكت')) {
            const ticketVoice = await channel.guild.channels.fetch(TICKET_VOICE_CHANNEL_ID).catch(() => null);
            if (ticketVoice) {
                await ticketVoice.permissionOverwrites.edit(channel.guild.roles.everyone, {
                    [PermissionFlagsBits.ViewChannel]: true,
                    [PermissionFlagsBits.Connect]: true
                });
            }
        }
    } catch (error) {}
});

client.on('channelDelete', async (channel) => {
    try {
        if (!channel.guild) return;
        const channelName = channel.name.toLowerCase();
        if (channelName.includes('ticket') || channelName.includes('تيكت')) {
            const ticketVoice = await channel.guild.channels.fetch(TICKET_VOICE_CHANNEL_ID).catch(() => null);
            if (ticketVoice) {
                await ticketVoice.permissionOverwrites.edit(channel.guild.roles.everyone, {
                    [PermissionFlagsBits.ViewChannel]: false,
                    [PermissionFlagsBits.Connect]: false
                });
            }
        }
    } catch (error) {}
});

// ============================================================
// الاتصال الدائم بالفويس
// ============================================================
async function connectToVoiceChannel() {
    try {
        const channel = await client.channels.fetch(TARGET_VOICE_CHANNEL_ID);
        if (!channel || channel.type !== ChannelType.GuildVoice) {
            console.log('❌ [VOICE] القناة مش موجودة أو مش قناة صوتية!');
            setTimeout(connectToVoiceChannel, 5000);
            return;
        }

        if (currentConnection) {
            try { currentConnection.destroy(); } catch (e) {}
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
            console.log(`✅ [VOICE] البوت اتصل بقناة: ${channel.name}`);
        });

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            console.log('⚠️ [VOICE] الاتصال انقطع، جاري إعادة المحاولة...');
            try {
                await entersState(connection, VoiceConnectionStatus.Signalling, 5_000);
                await entersState(connection, VoiceConnectionStatus.Connecting, 5_000);
            } catch (error) {
                try { connection.destroy(); } catch (e) {}
                setTimeout(connectToVoiceChannel, 1000);
            }
        });

        connection.on(VoiceConnectionStatus.Destroyed, () => {
            console.log('⚠️ [VOICE] الاتصال تدمر، جاري إعادة الاتصال...');
            setTimeout(connectToVoiceChannel, 1000);
        });

        connection.on('error', (err) => {
            console.error('❌ [VOICE] خطأ:', err.message);
            try { connection.destroy(); } catch (e) {}
            setTimeout(connectToVoiceChannel, 1000);
        });
    } catch (error) {
        console.error('❌ [VOICE] خطأ في الاتصال:', error.message);
        setTimeout(connectToVoiceChannel, 2000);
    }
}

// ============================================================
// Ready Event
// ============================================================
client.once("ready", async () => {
    console.log(`\n============================================`);
    console.log(`✅ HERTZ ADMIN BOT is online: ${client.user.tag}`);
    console.log(`📋 SERVER MEMBERS INTENT: ${client.options.intents.has('GuildMembers') ? '✅ مفعّل' : '❌ مش مفعّل'}`);
    console.log(`📋 GUILD ID: ${GUILD_ID}`);
    console.log(`📋 SUPABASE URL: ${process.env.SUPABASE_URL ? '✅ موجود' : '❌ مفقود'}`);
    console.log(`📋 SUPABASE KEY: ${SUPABASE_KEY ? '✅ موجود' : '❌ مفقود'}`);
    console.log(`📋 VOICE CHANNEL: ${TARGET_VOICE_CHANNEL_ID}`);
    console.log(`📋 GENERAL RULES CHANNEL: ${GENERAL_RULES_CHANNEL_ID}`);
    console.log(`📋 ADMIN RULES CHANNEL: ${ADMIN_RULES_CHANNEL_ID}`);
    console.log(`📋 MODE: Discord Events Only (No Polling)`);
    console.log(`============================================\n`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        const commands = [
            new SlashCommandBuilder()
                .setName('clear')
                .setDescription('حذف عدد معين من الرسائل بسرعة (خاص بالإدارة)')
                .addIntegerOption(option =>
                    option.setName('count')
                        .setDescription('عدد الرسائل المراد حذفها (من 1 إلى 100)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(100)
                ),
            new SlashCommandBuilder()
                .setName('sendrules')
                .setDescription('نشر القوانين العامة وقوانين الإدارة (خاص بالإدارة)')
        ].map(command => command.toJSON());

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('✅ تم تسجيل الأوامر بنجاح!');
    } catch (error) {
        console.error('❌ خطأ في تسجيل أوامر السلاش:', error);
    }

    connectToVoiceChannel();

    setInterval(async () => {
        try {
            if (!currentConnection || currentConnection.state.status === VoiceConnectionStatus.Disconnected || currentConnection.state.status === VoiceConnectionStatus.Destroyed) {
                console.log('🔄 [VOICE CHECK] إعادة الاتصال...');
                connectToVoiceChannel();
            }
        } catch (e) {
            connectToVoiceChannel();
        }
    }, 10 * 1000);
});

// ============================================================
// التعامل مع أوامر السلاش
// ============================================================
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'clear') {
        const userId = interaction.user.id;

        if (clearProcessing.has(userId)) {
            await interaction.reply({ content: '⏳ في عملية مسح جارية بالفعل.', ephemeral: true });
            return;
        }

        clearProcessing.add(userId);

        try {
            const authorized = await isAuthorizedFast(interaction.guild, userId);
            if (!authorized) {
                await interaction.reply({ content: '❌ عذراً، هذا الأمر مخصص للإدارة العليا فقط!', ephemeral: true });
                clearProcessing.delete(userId);
                return;
            }

            const count = interaction.options.getInteger('count');

            await interaction.deferReply({ ephemeral: true });
            const deleted = await interaction.channel.bulkDelete(count, true);
            await interaction.editReply({ content: `✅ تم بنجاح حذف **${deleted.size}** رسالة بكل نظافة.` });
        } catch (error) {
            console.error('❌ خطأ أثناء مسح الرسائل:', error);
            try {
                await interaction.editReply({ content: '❌ حدث خطأ أثناء محاولة مسح الرسائل.' });
            } catch (e) {}
        } finally {
            clearProcessing.delete(userId);
        }
    }

    if (interaction.commandName === 'sendrules') {
        try {
            const authorized = await isAuthorizedFast(interaction.guild, interaction.user.id);
            if (!authorized) {
                await interaction.reply({ content: '❌ عذراً، هذا الأمر مخصص للإدارة فقط!', ephemeral: true });
                return;
            }

            await interaction.deferReply({ ephemeral: true });

            let generalRules, adminRules;

            try {
                generalRules = fs.readFileSync('./rules-general.txt', 'utf8');
            } catch (e) {
                await interaction.editReply({ content: '❌ ملف `rules-general.txt` غير موجود في مجلد البوت!' });
                return;
            }

            try {
                adminRules = fs.readFileSync('./rules-admin.txt', 'utf8');
            } catch (e) {
                await interaction.editReply({ content: '❌ ملف `rules-admin.txt` غير موجود في مجلد البوت!' });
                return;
            }

            const generalChannel = interaction.guild.channels.cache.get(GENERAL_RULES_CHANNEL_ID);
            if (generalChannel) {
                await generalChannel.send(generalRules);
            } else {
                await interaction.editReply({ content: '❌ لم أستطع العثور على روم القوانين العامة!' });
                return;
            }

            const adminChannel = interaction.guild.channels.cache.get(ADMIN_RULES_CHANNEL_ID);
            if (adminChannel) {
                await adminChannel.send(adminRules);
            } else {
                await interaction.editReply({ content: '❌ لم أستطع العثور على روم الإدارة!' });
                return;
            }

            await interaction.editReply({ content: '✅ تم نشر القوانين العامة وقوانين الإدارة بنجاح!' });

        } catch (error) {
            console.error('❌ خطأ في نشر القوانين:', error);
            try {
                await interaction.editReply({ content: '❌ حدث خطأ أثناء نشر القوانين.' });
            } catch (e) {}
        }
    }
});

process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Server Port ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);

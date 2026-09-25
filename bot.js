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

// ✅ نظام منع الاسبام والمنشنات
const spamWarnings = new Map(); // userId -> { count: number, lastTime: timestamp }

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

    // قفل فوري
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
// نظام منع الاسبام والمنشنات
// ============================================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const userId = message.author.id;
    const currentTime = Date.now();

    // فحص الاسبام (الرسائل السريعة جداً أو المنشنات المتكررة)
    const isSpam = 
        message.mentions.has('@everyone') || 
        message.mentions.has('@here') || 
        message.mentions.members.size > 5 ||
        (message.content.length < 5 && message.mentions.members.size > 0);

    if (isSpam) {
        let userRecord = spamWarnings.get(userId) || { count: 0, lastTime: currentTime };

        // إذا كانت آخر رسالة قبل أقل من 10 ثواني، ارفع العدّاد
        if (currentTime - userRecord.lastTime < 10000) {
            userRecord.count += 1;
        } else {
            userRecord.count = 1;
        }

        userRecord.lastTime = currentTime;
        spamWarnings.set(userId, userRecord);

        console.log(`⚠️ [SPAM] ${message.author.tag} - Count: ${userRecord.count}`);

        // التحذير الأول
        if (userRecord.count === 1) {
            try {
                await message.delete();
                const warningEmbed = new EmbedBuilder()
                    .setColor(0xFFD700)
                    .setTitle('⚠️ تحذير من الاسبام')
                    .setDescription(`${message.author}, ممنوع الاسبام والمنشنات المتكررة في السيرفر!`)
                    .setFooter({ text: 'هذا تحذيرك الأول. المرة القادمة ستحصل على تايم أوت 10 دقائق' });

                const warningMsg = await message.channel.send({ embeds: [warningEmbed] });
                setTimeout(() => warningMsg.delete().catch(() => {}), 5000);
                return;
            } catch (err) {
                console.error('خطأ في حذف رسالة الاسبام:', err);
            }
        }

        // التايم أوت (المرة الثانية فما فوق)
        if (userRecord.count >= 2) {
            try {
                await message.delete();
                const member = await message.guild.members.fetch(userId);
                
                // تطبيق تايم أوت 10 دقائق
                await member.timeout(10 * 60 * 1000, 'اسبام ومنشنات متكررة');
                
                spamWarnings.delete(userId);

                const timeoutEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('🚫 تايم أوت')
                    .setDescription(`${message.author}, تم حظرك مؤقتاً لمدة 10 دقائق بسبب الاسبام والمنشنات المتكررة!`)
                    .setTimestamp();

                const timeoutMsg = await message.channel.send({ embeds: [timeoutEmbed] });
                setTimeout(() => timeoutMsg.delete().catch(() => {}), 5000);
                return;
            } catch (err) {
                console.error('خطأ في تطبيق التايم أوت:', err);
            }
        }
    } else {
        // مسح التحذير بعد 30 ثانية من آخر رسالة عادية
        if (spamWarnings.has(userId)) {
            const userRecord = spamWarnings.get(userId);
            if (currentTime - userRecord.lastTime > 30000) {
                spamWarnings.delete(userId);
                console.log(`✅ [SPAM CLEAR] تم مسح تحذيرات ${message.author.tag}`);
            }
        }
    }

    // ====== باقي النظام ======

    // حماية الروابط
    const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9][-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*))/gi;

    if (linkRegex.test(message.content)) {
        const isAdmin = await isAuthorizedFast(message.guild, message.author.id);
        if (isAdmin) return;

        try {
            await message.delete();

            const currentTimeLink = Date.now();
            let linkRecord = linkSpamMap.get(userId) || { count: 0, lastTime: currentTimeLink };

            if (currentTimeLink - linkRecord.lastTime < 60000) {
                linkRecord.count += 1;
            } else {
                linkRecord.count = 1;
            }
            linkRecord.lastTime = currentTimeLink;
            linkSpamMap.set(userId, linkRecord);

            if (linkRecord.count >= 2) {
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

    // نشر القوانين
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
    }


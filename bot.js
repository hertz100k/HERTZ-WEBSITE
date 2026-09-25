require("dotenv").config();
const { Client, GatewayIntentBits, Partials, ChannelType, PermissionFlagsBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require("@discordjs/voice");
const express = require("express");

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
const RULES_IMAGE_URL = "https://raw.githubusercontent.com/hertz100k/HERTZ-WEBSITE/main/%D8%A7%D9%84%D9%82%D9%88%D9%86%D9%8A%D9%86.jpg";
const ADMIN_RULES_IMAGE_URL = RULES_IMAGE_URL;

const LINK_WARNING_DURATION = 5000;
const LINK_TIMEOUT_DURATION = 60 * 60 * 1000;
const LINK_SPAM_WINDOW = 60 * 1000;
const LINK_SPAM_THRESHOLD = 2;
const TEXT_SPAM_WINDOW = 5000;
const TEXT_SPAM_THRESHOLD = 5;
const TEXT_SPAM_TIMEOUT = 10 * 60 * 1000;

const GENERAL_RULES_TEXT = `**1** - يجب احترام جميع الأعضاء والإدارة، ويُمنع نهائياً السب، الشتم، السخرية، أو الإهانة بأي شكل من الأشكال

**2** - يمنع منعاً باتاً نشر الروابط الخارجية، الإعلانات للسيرفرات الأخرى، أو نشر روابط مشبوهة.

**3** - يمنع منعاً باتاً نشر الروابط الخارجية، الإعلانات للسيرفرات الأخرى، أو نشر روابط مشبوهة.

**4** - يُرجى طرح استفساراتك أو مشاكل الخاصة بالموقع في رومات التكت (Tickets) أو الدعم المخصصة لذلك، وعدم إزعاج الإدارة في الرسائل الخاصة إلا بإذن مسبق.

**5** - يرجى شرح مشكلتك أو طلبك بوضوح ورفقة الأدلة أو الصور إن وجدت لتسهيل عملية المساعدة.

**6** - يُمنع نشر مواضيع أو منشورات في غير قنواتها المخصصة (مثل وضع استفسار في قناة الإعلانات أو الصور).

**7** - يجب أن تكون الأسماء المستعارة وصور البروفايل لائقة وغير مخالفة للآداب العامة أو تحتوي على رموز مسيئة.

**8** - يمنع نشر أي معلومات شخصية تخص أي عضو (أرقام هواتف، عناوين، إلخ) للحفاظ على أمان الجميع.

**9** - أي قرار يصدر من الإدارة أو المشرفين يجب تنفيذه، وفي حال وجود اعتراض يمكن فتحه كشكوى بشكل رسمي وبأدب داخل رومات الدعم.`;

const ADMIN_RULES_TEXT = `**1** - يجب على فريق الدعم والفريق التقني التعامل مع العملاء وأعضاء السيرفر بكل هدوء، احترافية، وسعة صدر، حتى في أصعب المواقف.

**2** - يُمنع منعاً باتاً تداول أو تسريب أي معلومات خاصة بالعملاء، بيانات المواقع، أكواد برمجية خاصة، أو تفاصيل الإدارة خارج النطاق المخصص لذلك.

**3** - يجب على فريق الدعم متابعة تكتات المساعدة وإغلاقها أو الرد عليها في أسرع وقت ممكن لضمان جودة الخدمة المقدمة للعملاء.

**4** - يُمنع إساءة استخدام الصلاحيات الإدارية (مثل الميوت، الكيك، البان، أو التعديل على رومات السيرفر) إلا في الأسباب الموجبة وطبقاً للتعليمات.

**5** - في حال واجه الدعم الفني مشكلة تقنية معقدة في الموقع أو الخدمة المقدمة، يجب تصعيدها فوراً للمطور المسؤول وعدم إعطاء معلومات غير دقيقة للعميل.

**6** - يجب توثيق أي تعديلات جذرية تتم على السيرفر أو طلبات الدعم الخاصة بالمواقع لضمان سهولة المتابعة بين أفراد الإدارة.

**7** - يُعتبر الإداري واجهة للموقع والشركة؛ لذا يجب الالتزام بالقوانين العامة للسيرفر بشكل كامل قبل مطالبة الأعضاء بها.`;

const PORT = process.env.PORT || 3000;
const TARGET_HOURS = 1000;
let voiceSessionStartTime = null;

// ============================================================
// ✅ Sets لمنع التكرار
// ============================================================
const movedMessages = new Set();
const processingLocks = new Set();
const sourceMessagesDeleted = new Set();
const vaultMessages = new Set();

// ✅ مجموعة الأعضاء اللي اترحب بيهم ومغادروا
const welcomedMembers = new Set();
const leftMembers = new Set();

const clearProcessing = new Set();
const rulesProcessing = new Set();
const linkSpamMap = new Map();
const textSpamMap = new Map();

console.log('\n🔍 [ENV CHECK]:');
console.log('   DISCORD_TOKEN:', process.env.DISCORD_TOKEN ? '✅' : '❌');
console.log('   SUPABASE_URL:', process.env.SUPABASE_URL ? '✅' : '⚠️');
console.log('   SUPABASE_KEY:', process.env.SUPABASE_KEY ? '✅' : '⚠️');

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

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
    const uptimeHours = voiceSessionStartTime ? ((Date.now() - voiceSessionStartTime) / (1000 * 60 * 60)).toFixed(2) : 0;
    res.send(`HERTZ ADMIN BOT is running. | Voice: ${uptimeHours}h / ${TARGET_HOURS}h`);
});

async function isAuthorizedFast(guild, userId) {
    try {
        let member = guild.members.cache.get(userId);
        if (!member) {
            try { member = await guild.members.fetch(userId); } catch (e) { return false; }
        }
        if (!member) return false;
        return member.roles.cache.has(AUTHORIZED_ROLE_ID);
    } catch (err) { return false; }
}

async function deployRules(guild, silent = false) {
    const everyoneRole = guild.roles.everyone;
    try {
        const generalChannel = await guild.channels.fetch(GENERAL_RULES_CHANNEL_ID).catch(() => null);
        if (!generalChannel) { return { success: false, message: 'روم القوانين العامة مش موجود!' }; }
        const botMember = guild.members.me;
        const perms = generalChannel.permissionsFor(botMember);
        if (!perms || !perms.has(PermissionFlagsBits.SendMessages)) { return { success: false, message: 'البوت مش عنده صلاحية إرسال!' }; }
        const generalEmbed = new EmbedBuilder()
            .setColor(0x2b2d31).setTitle('📜 مرحباً بكم في قوانين سيرفرنا')
            .setDescription(GENERAL_RULES_TEXT).setImage(RULES_IMAGE_URL)
            .setFooter({ text: `${SERVER_NAME} • القوانين العامة`, iconURL: guild.iconURL({ dynamic: true }) || undefined })
            .setTimestamp();
        await generalChannel.send({ content: `${everyoneRole} **يرجى قراءة القوانين بعناية**`, embeds: [generalEmbed] });
        if (!silent) console.log(`✅ [RULES] القوانين العامة اتنشرت!`);
    } catch (err) { console.error(`❌ [RULES]`, err.message); return { success: false, message: 'خطأ!' }; }

    try {
        const adminChannel = await guild.channels.fetch(ADMIN_RULES_CHANNEL_ID).catch(() => null);
        if (!adminChannel) { return { success: false, message: 'روم قوانين الإدارة مش موجود!' }; }
        const botMember = guild.members.me;
        const perms = adminChannel.permissionsFor(botMember);
        if (!perms || !perms.has(PermissionFlagsBits.SendMessages)) { return { success: false, message: 'البوت مش عنده صلاحية إرسال!' }; }
        const adminEmbed = new EmbedBuilder()
            .setColor(0x2b2d31).setTitle('📜 مرحباً بكم في قوانين الإدارة')
            .setDescription(ADMIN_RULES_TEXT).setImage(ADMIN_RULES_IMAGE_URL)
            .setFooter({ text: `${SERVER_NAME} • قوانين الإدارة`, iconURL: guild.iconURL({ dynamic: true }) || undefined })
            .setTimestamp();
        await adminChannel.send({ content: `${everyoneRole} **يرجى قراءة قوانين الإدارة بعناية**`, embeds: [adminEmbed] });
        if (!silent) console.log(`✅ [RULES] قوانين الإدارة اتنشرت!`);
    } catch (err) { console.error(`❌ [RULES]`, err.message); return { success: false, message: 'خطأ!' }; }

    return { success: true, message: '✅ تم نشر القوانين بنجاح!' };
}

// ============================================================
// ✅ الترحيب (منع تكرار 100% - مرة واحدة بس)
// ============================================================
async function sendWelcomeMessage(guild, member) {
    const memberId = member.id;

    if (member.user.bot) return;
    if (welcomedMembers.has(memberId)) return;

    // ✅ علامة فورية قبل أي حاجة
    welcomedMembers.add(memberId);

    try {
        console.log(`\n🎉 [WELCOME] ${member.user.tag}`);

        try {
            const role = guild.roles.cache.get(AUTO_ROLE_ID);
            if (role) await member.roles.add(role, 'رول تلقائي');
        } catch (e) { console.error(`❌ [AUTO ROLE]`, e.message); }

        const welcomeChannel = await guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
        if (!welcomeChannel) return;

        const embed = new EmbedBuilder()
            .setColor(0x5865F2).setTitle(`مرحباً بك في السيرفر`)
            .setDescription(`أهلاً بك يا <@${memberId}> في سيرفر **${SERVER_NAME}**`)
            .setImage(WELCOME_IMAGE_URL)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setTimestamp();

        await welcomeChannel.send({ embeds: [embed] });
        console.log(`✅ [WELCOME] ${member.user.tag}`);
    } catch (e) {
        console.error(`❌ [WELCOME]`, e);
    }
}

// ============================================================
// ✅ المغادرة (منع تكرار 100% - مرة واحدة بس)
// ============================================================
async function sendLeaveMessage(guild, memberId, memberTag) {
    if (leftMembers.has(memberId)) return;

    // ✅ علامة فورية قبل أي حاجة
    leftMembers.add(memberId);

    try {
        console.log(`\n🚪 [LEAVE] ${memberTag}`);

        const leaveChannel = await guild.channels.fetch(LEAVE_CHANNEL_ID).catch(() => null);
        if (!leaveChannel) return;

        await leaveChannel.send({ content: `**غادر** <@${memberId}>` });
        console.log(`✅ [LEAVE] ${memberTag}`);
    } catch (e) {
        console.error(`❌ [LEAVE]`, e);
    }
}

// ============================================================
// ❌❌❌ مش هنستخدم guildMemberAdd / guildMemberRemove
// ✅ Polling هو المصدر الوحيد
// ============================================================

let knownMembers = new Set();
let pollCount = 0;
let isFirstPoll = true;
let isPolling = false;

async function pollMembers() {
    if (isPolling) return;
    isPolling = true;
    try {
        pollCount++;
        const guild = client.guilds.cache.get(GUILD_ID) || client.guilds.cache.first();
        if (!guild) { isPolling = false; return; }
        const members = await guild.members.fetch();

        // ✅ أول Poll: نسجل الأعضاء الحاليين ونخرج (عشان مفيش ترحيب جماعي)
        if (isFirstPoll) {
            members.forEach(m => knownMembers.add(m.id));
            console.log(`📋 [POLL #${pollCount}] تم تسجيل ${knownMembers.size} عضو (بدون إرسال ترحيب).`);
            isFirstPoll = false;
            isPolling = false;
            return;
        }

        // ✅ الأعضاء الجدد: نبعت ترحيب (مرة واحدة بس)
        for (const [id, member] of members) {
            if (!knownMembers.has(id)) {
                knownMembers.add(id);
                if (member.user.bot) continue;
                if (welcomedMembers.has(id)) continue;

                console.log(`\n🆕 [POLL] عضو جديد: ${member.user.tag}`);
                await sendWelcomeMessage(guild, member);
            }
        }

        // ✅ الأعضاء اللي خرجوا: نبعت مغادرة (مرة واحدة بس)
        for (const id of knownMembers) {
            if (!members.has(id)) {
                knownMembers.delete(id);
                if (leftMembers.has(id)) continue;

                try {
                    const user = await client.users.fetch(id).catch(() => null);
                    if (user && !user.bot) {
                        console.log(`\n🚪 [POLL] عضو خرج: ${user.tag}`);
                        await sendLeaveMessage(guild, id, user.tag);
                    }
                } catch (e) {}
            }
        }
    } catch (e) {
        console.error('❌ [POLL]', e.message);
    } finally {
        isPolling = false;
    }
}

// ============================================================
// ✅ حماية الروابط + السبام
// ============================================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    const isAdmin = await isAuthorizedFast(message.guild, message.author.id);
    if (isAdmin) return;
    const userId = message.author.id;
    const currentTime = Date.now();

    const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9][-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*))/gi;

    if (linkRegex.test(message.content)) {
        try {
            await message.delete().catch(() => {});
            let userRecord = linkSpamMap.get(userId) || { count: 0, lastTime: currentTime };
            if (currentTime - userRecord.lastTime < LINK_SPAM_WINDOW) userRecord.count += 1;
            else userRecord.count = 1;
            userRecord.lastTime = currentTime;
            linkSpamMap.set(userId, userRecord);
            console.log(`🔗 [LINK] ${message.author.tag} (تكرار: ${userRecord.count})`);
            if (userRecord.count >= LINK_SPAM_THRESHOLD) {
                try {
                    const member = await message.guild.members.fetch(userId);
                    await member.timeout(LINK_TIMEOUT_DURATION, 'إرسال روابط متكررة');
                    linkSpamMap.delete(userId);
                    const warningMsg = await message.channel.send(`⚠️ ${message.author} تم إعطاؤك **تايم أوت لمدة ساعة** بسبب إرسال الروابط المتكررة.`);
                    setTimeout(() => warningMsg.delete().catch(() => {}), LINK_WARNING_DURATION);
                    return;
                } catch (err) { console.error('❌', err.message); }
            }
            const firstWarning = await message.channel.send(`⚠️ ${message.author} ممنوع نشر الروابط! التكرار سيؤدي إلى تايم أوت.`);
            setTimeout(() => firstWarning.delete().catch(() => {}), LINK_WARNING_DURATION);
            return;
        } catch (e) { console.error('❌', e.message); }
    }

    try {
        let textRecord = textSpamMap.get(userId) || { timestamps: [] };
        textRecord.timestamps = textRecord.timestamps.filter(ts => currentTime - ts < TEXT_SPAM_WINDOW);
        textRecord.timestamps.push(currentTime);
        textSpamMap.set(userId, textRecord);
        if (textRecord.timestamps.length >= TEXT_SPAM_THRESHOLD) {
            try {
                const member = await message.guild.members.fetch(userId);
                await member.timeout(TEXT_SPAM_TIMEOUT, 'إرسال رسائل سبام');
                textSpamMap.delete(userId);
                const warningMsg = await message.channel.send(`⚠️ ${message.author} تم إعطاؤك **تايم أوت لمدة 10 دقائق** بسبب السبام.`);
                setTimeout(() => warningMsg.delete().catch(() => {}), LINK_WARNING_DURATION);
                return;
            } catch (err) { console.error('❌', err.message); }
        }
    } catch (e) { console.error('❌', e.message); }
});

// ============================================================
// ✅ نقل الرسائل للمخزن (منع تكرار 100%)
// ============================================================
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) { try { await reaction.fetch(); } catch (e) { return; } }
    const message = reaction.message;
    if (message.partial) { try { await message.fetch(); } catch (e) { return; } }
    if (!message.guild) return;

    const messageId = message.id;

    if (movedMessages.has(messageId)) return;
    if (sourceMessagesDeleted.has(messageId)) return;
    if (processingLocks.has(messageId)) return;

    processingLocks.add(messageId);

    try {
        const isTargetChannel = message.channelId === SUPPORT_CHANNEL_ID || message.channelId === ORDER_CHANNEL_ID || message.channelId === CANCEL_CHANNEL_ID;
        if (!isTargetChannel) { processingLocks.delete(messageId); return; }

        const authorized = await isAuthorizedFast(message.guild, user.id);
        if (!authorized) { processingLocks.delete(messageId); return; }

        if (reaction.emoji.name !== '✅') { processingLocks.delete(messageId); return; }

        let targetVaultId = null;
        if (message.channelId === SUPPORT_CHANNEL_ID) targetVaultId = TRASH_SUPPORT_CHANNEL_ID;
        else if (message.channelId === ORDER_CHANNEL_ID) targetVaultId = TRASH_ORDER_CHANNEL_ID;
        else if (message.channelId === CANCEL_CHANNEL_ID) targetVaultId = TRASH_CANCEL_CHANNEL_ID;

        if (!targetVaultId) { processingLocks.delete(messageId); return; }

        const vaultKey = `${targetVaultId}:${messageId}`;
        if (vaultMessages.has(vaultKey)) { processingLocks.delete(messageId); return; }

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
                content: `👤 **بواسطة:** <@${user.id}>\n📜 **المحتوى:**\n${msgContent !== "" ? msgContent : "**[مرفقات]**"}`,
                embeds: msgEmbeds,
                files: msgFiles
            });

            sourceMessagesDeleted.add(messageId);
            await message.delete().catch(() => {});
            console.log(`✅ [MOVE] ${messageId}`);
        } catch (e) {
            console.error(`❌ [MOVE]`, e.message);
            movedMessages.delete(messageId);
            vaultMessages.delete(vaultKey);
        }
    } finally {
        processingLocks.delete(messageId);
    }
});

// ============================================================
// نظام التيكت فويس
// ============================================================
client.on('channelCreate', async (channel) => {
    try {
        if (!channel.guild) return;
        const n = channel.name.toLowerCase();
        if (n.includes('ticket') || n.includes('تيكت')) {
            const v = await channel.guild.channels.fetch(TICKET_VOICE_CHANNEL_ID).catch(() => null);
            if (v) await v.permissionOverwrites.edit(channel.guild.roles.everyone, { [PermissionFlagsBits.ViewChannel]: true, [PermissionFlagsBits.Connect]: true });
        }
    } catch (e) {}
});

client.on('channelDelete', async (channel) => {
    try {
        if (!channel.guild) return;
        const n = channel.name.toLowerCase();
        if (n.includes('ticket') || n.includes('تيكت')) {
            const v = await channel.guild.channels.fetch(TICKET_VOICE_CHANNEL_ID).catch(() => null);
            if (v) await v.permissionOverwrites.edit(channel.guild.roles.everyone, { [PermissionFlagsBits.ViewChannel]: false, [PermissionFlagsBits.Connect]: false });
        }
    } catch (e) {}
});

// ============================================================
// الفويس
// ============================================================
async function connectToVoiceChannel() {
    try {
        const channel = await client.channels.fetch(TARGET_VOICE_CHANNEL_ID);
        if (!channel || channel.type !== ChannelType.GuildVoice) return;
        const connection = joinVoiceChannel({ channelId: channel.id, guildId: channel.guild.id, adapterCreator: channel.guild.voiceAdapterCreator, selfDeaf: false, selfMute: false });
        currentConnection = connection;
        connection.on(VoiceConnectionStatus.Ready, () => { if (!voiceSessionStartTime) voiceSessionStartTime = Date.now(); });
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try { await entersState(connection, VoiceConnectionStatus.Signalling, 1_000); }
            catch (e) { try { connection.destroy(); } catch (err) {} setTimeout(connectToVoiceChannel, 200); }
        });
        connection.on('error', () => { try { connection.destroy(); } catch (e) {} setTimeout(connectToVoiceChannel, 200); });
    } catch (e) { setTimeout(connectToVoiceChannel, 1000); }
}

// ============================================================
// Ready Event
// ============================================================
client.once("ready", async () => {
    console.log(`\n============================================`);
    console.log(`✅ HERTZ ADMIN BOT: ${client.user.tag}`);
    console.log(`============================================\n`);

    // ✅ نمسح الـ Sets عشان مع كل Restart، البوت يبدأ من جديد بدون تكرار
    welcomedMembers.clear();
    leftMembers.clear();

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        const commands = [
            new SlashCommandBuilder().setName('clear').setDescription('حذف رسائل (خاص بالإدارة)')
                .addIntegerOption(o => o.setName('count').setDescription('العدد (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
            new SlashCommandBuilder().setName('sendrules').setDescription('نشر القوانين (خاص بالإدارة)')
        ].map(c => c.toJSON());
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ تم تسجيل الأوامر!');
    } catch (e) { console.error('❌', e); }

    setTimeout(async () => {
        try {
            const guild = client.guilds.cache.get(GUILD_ID) || client.guilds.cache.first();
            if (guild) { const r = await deployRules(guild, false); if (r.success) console.log('✅ [RULES] نشر تلقائي!'); else console.error(`❌ ${r.message}`); }
        } catch (e) { console.error('❌', e.message); }
    }, 3000);

    connectToVoiceChannel();

    // ✅ Polling كل 30 ثانية — المصدر الوحيد للترحيب والمغادرة
    setTimeout(async () => {
        await pollMembers();
        setInterval(pollMembers, 30000);
    }, 5000);

    setInterval(() => {
        try {
            if (!currentConnection || currentConnection.state.status === VoiceConnectionStatus.Disconnected || currentConnection.state.status === VoiceConnectionStatus.Destroyed) connectToVoiceChannel();
        } catch (e) { connectToVoiceChannel(); }
    }, 10 * 1000);
});

// ============================================================
// ✅ أوامر السلاش
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
                await interaction.reply({ content: '❌ للإدارة فقط!', ephemeral: true });
                clearProcessing.delete(userId);
                return;
            }

            const count = interaction.options.getInteger('count');

            if (!interaction.channel || !interaction.channel.isTextBased()) {
                await interaction.reply({ content: '❌ الأمر ده في الرومات النصية بس!', ephemeral: true });
                clearProcessing.delete(userId);
                return;
            }

            await interaction.deferReply({ ephemeral: true });

            const deleted = await interaction.channel.bulkDelete(count, true);

            if (deleted.size === 0) {
                await interaction.editReply({ content: '⚠️ مفيش رسائل اتحذفت (ممكن تكون أقدم من 14 يوم أو مفيش رسائل).' });
            } else {
                await interaction.editReply({ content: `✅ تم حذف **${deleted.size}** رسالة بنجاح.` });
            }
        } catch (e) {
            console.error('❌ [CLEAR]', e);
            try {
                await interaction.editReply({ content: `❌ خطأ: ${e.message}` });
            } catch (err) {}
        } finally {
            clearProcessing.delete(userId);
        }
    }

    if (interaction.commandName === 'sendrules') {
        const userId = interaction.user.id;
        if (rulesProcessing.has(userId)) { await interaction.reply({ content: '⏳', ephemeral: true }); return; }
        rulesProcessing.add(userId);
        try {
            const authorized = await isAuthorizedFast(interaction.guild, userId);
            if (!authorized) { await interaction.reply({ content: '❌ للإدارة فقط!', ephemeral: true }); rulesProcessing.delete(userId); return; }
            await interaction.deferReply({ ephemeral: true });
            const result = await deployRules(interaction.guild, true);
            await interaction.editReply({ content: result.message });
        } catch (e) { try { await interaction.editReply({ content: '❌ خطأ.' }); } catch (err) {} }
        finally { rulesProcessing.delete(userId); }
    }
});

process.on('unhandledRejection', (r) => console.error('⚠️', r?.message || r));
process.on('uncaughtException', (e) => console.error('⚠️', e?.message || e));

app.listen(PORT, "0.0.0.0", () => console.log(`🌐 Port ${PORT}`));

client.login(process.env.DISCORD_TOKEN).catch((err) => console.error('❌ [LOGIN]', err.message));

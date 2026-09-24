require("dotenv").config();

const { Client, GatewayIntentBits, Partials, ChannelType, PermissionFlagsBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require("@discordjs/voice");
const { createClient } = require("@supabase/supabase-js");
const express = require("express");

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

const welcomedMembers = new Set();
const leftMembers = new Set();
const welcomeProcessing = new Set();
const leaveProcessing = new Set();

const clearProcessing = new Set();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
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
// دالة إرسال رسالة الترحيب (منع تكرار - 4 طبقات)
// ============================================================
async function sendWelcomeMessage(guild, member) {
    const memberId = member.id;

    if (welcomedMembers.has(memberId)) return;
    if (welcomeProcessing.has(memberId)) return;
    if (member.user.bot) return;

    welcomeProcessing.add(memberId);
    welcomedMembers.add(memberId);
    leftMembers.delete(memberId);

    try {
        console.log(`\n🎉 [WELCOME START] بدء الترحيب بـ ${member.user.tag}`);

        try {
            const role = guild.roles.cache.get(AUTO_ROLE_ID);
            if (role) {
                await member.roles.add(role, 'رول تلقائي للأعضاء الجدد');
                console.log(`✅ [AUTO ROLE] تم إعطاء الرول`);
            }
        } catch (roleError) {
            console.error(`❌ [AUTO ROLE] فشل:`, roleError.message);
        }

        const welcomeChannel = await guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
        if (!welcomeChannel) {
            console.error(`❌ [WELCOME] قناة الترحيب مش موجودة!`);
            welcomedMembers.delete(memberId);
            return;
        }

        const botMember = guild.members.me;
        if (!botMember) {
            welcomedMembers.delete(memberId);
            return;
        }

        const permissions = welcomeChannel.permissionsFor(botMember);
        if (!permissions ||
            !permissions.has(PermissionFlagsBits.ViewChannel) ||
            !permissions.has(PermissionFlagsBits.SendMessages) ||
            !permissions.has(PermissionFlagsBits.EmbedLinks)) {
            console.error(`❌ [WELCOME] البوت مش عنده الصلاحيات الكافية!`);
            welcomedMembers.delete(memberId);
            return;
        }

        const memberMention = `<@${memberId}>`;

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`مرحباً بك في السيرفر`)
            .setDescription(
                `أهلاً بك يا ${memberMention} في سيرفر **${SERVER_NAME}**`
            )
            .setImage(WELCOME_IMAGE_URL)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setTimestamp();

        await welcomeChannel.send({ embeds: [embed] });

        console.log(`✅ [WELCOME SUCCESS] تم الترحيب بـ ${member.user.tag}\n`);
    } catch (error) {
        console.error(`❌ [WELCOME ERROR]:`, error);
        welcomedMembers.delete(memberId);
    } finally {
        welcomeProcessing.delete(memberId);
    }
}

// ============================================================
// دالة إرسال رسالة المغادرة (منع تكرار - 4 طبقات)
// ============================================================
async function sendLeaveMessage(guild, memberId, memberTag) {
    if (leftMembers.has(memberId)) return;
    if (leaveProcessing.has(memberId)) return;

    leaveProcessing.add(memberId);
    leftMembers.add(memberId);
    welcomedMembers.delete(memberId);

    try {
        console.log(`\n🚪 [LEAVE START] بدء المغادرة لـ ${memberTag}`);

        const leaveChannel = await guild.channels.fetch(LEAVE_CHANNEL_ID).catch(() => null);
        if (!leaveChannel) {
            leftMembers.delete(memberId);
            return;
        }

        const botMember = guild.members.me;
        if (!botMember) {
            leftMembers.delete(memberId);
            return;
        }

        const permissions = leaveChannel.permissionsFor(botMember);
        if (!permissions ||
            !permissions.has(PermissionFlagsBits.ViewChannel) ||
            !permissions.has(PermissionFlagsBits.SendMessages)) {
            leftMembers.delete(memberId);
            return;
        }

        const memberMention = `<@${memberId}>`;

        await leaveChannel.send({
            content: `**غادر** ${memberMention}`
        });

        console.log(`✅ [LEAVE SUCCESS] تم تسجيل مغادرة ${memberTag}\n`);
    } catch (error) {
        console.error(`❌ [LEAVE ERROR]:`, error);
        leftMembers.delete(memberId);
    } finally {
        leaveProcessing.delete(memberId);
    }
}

// ============================================================
// الأحداث الأساسية
// ============================================================
client.on('guildMemberAdd', async (member) => {
    console.log(`\n🔔 [EVENT] guildMemberAdd: ${member.user.tag}`);
    await sendWelcomeMessage(member.guild, member);
});

client.on('guildMemberRemove', async (member) => {
    console.log(`\n🔔 [EVENT] guildMemberRemove: ${member.user.tag}`);
    await sendLeaveMessage(member.guild, member.id, member.user.tag);
});

// ============================================================
// Polling كل 30 ثانية (مع منع تكرار)
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
        if (!guild) {
            isPolling = false;
            return;
        }

        const members = await guild.members.fetch();

        if (isFirstPoll) {
            members.forEach(m => knownMembers.add(m.id));
            console.log(`📋 [POLL #${pollCount}] تم تسجيل ${knownMembers.size} عضو حاليين.`);
            isFirstPoll = false;
            isPolling = false;
            return;
        }

        for (const [id, member] of members) {
            if (!knownMembers.has(id)) {
                knownMembers.add(id);
                if (member.user.bot) continue;
                if (welcomedMembers.has(id)) continue;
                if (welcomeProcessing.has(id)) continue;

                console.log(`\n🆕 [POLL] عضو جديد دخل: ${member.user.tag}`);
                await sendWelcomeMessage(guild, member);
            }
        }

        for (const id of knownMembers) {
            if (!members.has(id)) {
                knownMembers.delete(id);
                if (leftMembers.has(id)) continue;
                if (leaveProcessing.has(id)) continue;

                try {
                    const user = await client.users.fetch(id).catch(() => null);
                    if (user && !user.bot) {
                        console.log(`\n🚪 [POLL] عضو خرج: ${user.tag}`);
                        await sendLeaveMessage(guild, id, user.tag);
                    }
                } catch (e) {}
            }
        }
    } catch (error) {
        // صامت
    } finally {
        isPolling = false;
    }
}

// ============================================================
// نظام النقل الرقابي (Move) - منع تكرار 5 طبقات
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

    // ✅ طبقة 1
    if (movedMessages.has(messageId)) return;
    // ✅ طبقة 2
    if (sourceMessagesDeleted.has(messageId)) return;
    // ✅ طبقة 3
    if (processingLocks.has(messageId)) return;

    // ✅ طبقة 4: قفل فوري
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

        // ✅ طبقة 5: منع تكرار في نفس الخزنة
        const vaultKey = `${targetVaultId}:${messageId}`;
        if (vaultMessages.has(vaultKey)) {
            processingLocks.delete(messageId);
            return;
        }

        // ✅ علامة النقل النهائية BEFORE أي async
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
        if (!channel || channel.type !== ChannelType.GuildVoice) return;

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
        });

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await entersState(connection, VoiceConnectionStatus.Signalling, 1_000);
            } catch (error) {
                try { connection.destroy(); } catch (e) {}
                setTimeout(connectToVoiceChannel, 200);
            }
        });

        connection.on('error', () => {
            try { connection.destroy(); } catch (e) {}
            setTimeout(connectToVoiceChannel, 200);
        });
    } catch (error) {
        setTimeout(connectToVoiceChannel, 1000);
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
                )
        ].map(command => command.toJSON());

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('✅ تم تسجيل أمر /clear بنجاح!');
    } catch (error) {
        console.error('❌ خطأ في تسجيل أوامر السلاش:', error);
    }

    connectToVoiceChannel();

    console.log('🔄 [POLL] جاري تشغيل مراقبة الأعضاء (كل 30 ثانية)...');
    setTimeout(async () => {
        await pollMembers();
        setInterval(pollMembers, 30000);
    }, 5000);

    setInterval(async () => {
        try {
            if (!currentConnection || currentConnection.state.status === VoiceConnectionStatus.Disconnected || currentConnection.state.status === VoiceConnectionStatus.Destroyed) {
                connectToVoiceChannel();
            }
        } catch (e) {
            connectToVoiceChannel();
        }
    }, 10 * 1000);
});

// ============================================================
// التعامل مع أمر /clear
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
});

process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Server Port ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);

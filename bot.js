require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    Partials,
    ChannelType,
    PermissionFlagsBits,
    REST,
    Routes,
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    joinVoiceChannel,
    entersState,
    VoiceConnectionStatus
} = require("@discordjs/voice");

const express = require("express");
const fs = require("fs");


// ============================================================
// 📌 الإعدادات
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

const WELCOME_IMAGE_URL =
    "https://raw.githubusercontent.com/titopanel2-oss/tool/main/welcome.gif";

const SERVER_NAME = "co.developer support";

const GUILD_ID = "1549528572037922868";

const GENERAL_RULES_CHANNEL_ID = "1550604801015025756";
const ADMIN_RULES_CHANNEL_ID = "1550655493628895312";

const RULES_IMAGE_URL =
    "https://raw.githubusercontent.com/hertz100k/HERTZ-WEBSITE/main/%D8%A7%D9%84%D9%82%D9%88%D9%86%D9%8A%D9%86.jpg";

const ADMIN_RULES_IMAGE_URL = RULES_IMAGE_URL;


// ============================================================
// 🛡️ إعدادات الحماية والسبام
// ============================================================

const LINK_WARNING_DURATION = 5000;
const LINK_TIMEOUT_DURATION = 60 * 60 * 1000;

const LINK_SPAM_WINDOW = 60 * 1000;
const LINK_SPAM_THRESHOLD = 2;

const TEXT_SPAM_WINDOW = 5000;
const TEXT_SPAM_THRESHOLD = 5;

const TEXT_SPAM_TIMEOUT = 10 * 60 * 1000;


// ============================================================
// 🌐 PORT
// ============================================================

const PORT = process.env.PORT || 3000;

let voiceSessionStartTime = null;


// ============================================================
// 🛡️ منع تكرار العمليات
// ============================================================

const movedMessages = new Set();
const processingLocks = new Set();
const sourceMessagesDeleted = new Set();
const vaultMessages = new Set();

const clearProcessing = new Set();
const rulesProcessing = new Set();

const linkSpamMap = new Map();
const textSpamMap = new Map();


// ============================================================
// 🚨 حماية الترحيب والمغادرة
// ============================================================

const welcomeLocks = new Set();
const leaveLocks = new Set();

const welcomeCooldown = new Map();
const leaveCooldown = new Map();


// مدة منع تكرار نفس الحدث
const MEMBER_EVENT_COOLDOWN = 60 * 1000;


// ============================================================
// 💾 ملف أحداث الترحيب والمغادرة
// ============================================================

const EVENT_FILE = "./event-dedupe.json";

let eventDatabase = {
    welcomes: {},
    leaves: {}
};


// ============================================================
// 📂 تحميل قاعدة منع التكرار
// ============================================================

function loadEventDatabase() {

    try {

        if (!fs.existsSync(EVENT_FILE)) {

            fs.writeFileSync(
                EVENT_FILE,
                JSON.stringify(
                    eventDatabase,
                    null,
                    2
                ),
                "utf8"
            );

            return;
        }


        const data =
            fs.readFileSync(
                EVENT_FILE,
                "utf8"
            );


        if (!data.trim()) {
            return;
        }


        const parsed =
            JSON.parse(data);


        if (parsed && typeof parsed === "object") {

            eventDatabase = {

                welcomes:
                    parsed.welcomes || {},

                leaves:
                    parsed.leaves || {}

            };

        }

    } catch (error) {

        console.error(
            "❌ [EVENT DATABASE LOAD]",
            error.message
        );

    }

}


// ============================================================
// 💾 حفظ قاعدة منع التكرار
// ============================================================

function saveEventDatabase() {

    try {

        const tempFile =
            `${EVENT_FILE}.tmp`;


        fs.writeFileSync(

            tempFile,

            JSON.stringify(
                eventDatabase,
                null,
                2
            ),

            "utf8"

        );


        fs.renameSync(
            tempFile,
            EVENT_FILE
        );


    } catch (error) {

        console.error(
            "❌ [EVENT DATABASE SAVE]",
            error.message
        );

    }

}


// ============================================================
// 🧹 تنظيف الأحداث القديمة
// ============================================================

function cleanupEventDatabase() {

    const maxAge =
        7 * 24 * 60 * 60 * 1000;


    const cutoff =
        Date.now() - maxAge;


    for (
        const type of [
            "welcomes",
            "leaves"
        ]
    ) {

        for (
            const [key, value]
            of Object.entries(
                eventDatabase[type]
            )
        ) {

            if (
                !value ||
                !value.timestamp ||
                value.timestamp < cutoff
            ) {

                delete eventDatabase[type][key];

            }

        }

    }


    saveEventDatabase();

}


loadEventDatabase();

cleanupEventDatabase();


// ============================================================
// 🔐 إنشاء Event ID
// ============================================================

function createEventId(
    type,
    guildId,
    memberId,
    timestamp
) {

    return `${type}:${guildId}:${memberId}:${timestamp}`;

}


// ============================================================
// 🔎 البحث عن Event سابق في الذاكرة/الملف
// ============================================================

function wasEventProcessed(
    type,
    eventId
) {

    return Boolean(
        eventDatabase[type]?.[eventId]
    );

}


// ============================================================
// 💾 تسجيل Event
// ============================================================

function markEventProcessed(
    type,
    eventId
) {

    if (!eventDatabase[type]) {

        eventDatabase[type] = {};

    }


    eventDatabase[type][eventId] = {

        timestamp:
            Date.now()

    };


    saveEventDatabase();

}


// ============================================================
// 🔎 البحث عن Marker في آخر رسائل الروم
// ============================================================

async function findExistingEventMessage(
    channel,
    eventMarker
) {

    try {

        if (
            !channel ||
            !channel.isTextBased()
        ) {

            return null;

        }


        const messages =
            await channel.messages.fetch({
                limit: 100
            });


        for (
            const message
            of messages.values()
        ) {

            if (
                message.author?.id !==
                client.user?.id
            ) {

                continue;

            }


            // Marker في المحتوى
            if (
                message.content &&
                message.content.includes(
                    eventMarker
                )
            ) {

                return message;

            }


            // Marker في الـ Embeds
            if (
                message.embeds?.length
            ) {

                for (
                    const embed
                    of message.embeds
                ) {

                    const allText = [

                        embed.title || "",

                        embed.description || "",

                        embed.footer?.text || ""

                    ].join(" ");


                    if (
                        allText.includes(
                            eventMarker
                        )
                    ) {

                        return message;

                    }

                }

            }

        }


    } catch (error) {

        console.error(
            "❌ [EVENT SEARCH]",
            error.message
        );

    }


    return null;

}


// ============================================================
// 🛡️ إرسال رسالة Event واحدة فقط
// ============================================================

async function sendUniqueEventMessage(
    channel,
    eventMarker,
    payload
) {

    // --------------------------------------------------------
    // فحص الروم
    // --------------------------------------------------------

    if (
        !channel ||
        !channel.isTextBased()
    ) {

        return false;

    }


    // --------------------------------------------------------
    // لو الرسالة موجودة بالفعل
    // --------------------------------------------------------

    const existing =
        await findExistingEventMessage(
            channel,
            eventMarker
        );


    if (existing) {

        console.log(
            `🛑 [ANTI DUPLICATE] الحدث موجود بالفعل: ${eventMarker}`
        );

        return false;

    }


    // --------------------------------------------------------
    // إرسال الرسالة
    // --------------------------------------------------------

    await channel.send(
        payload
    );


    console.log(
        `✅ [EVENT SENT] ${eventMarker}`
    );


    return true;

}


// ============================================================
// 🤖 Discord Client
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

        Partials.Message,

        Partials.Channel,

        Partials.Reaction,

        Partials.GuildMember,

        Partials.User

    ]

});


// ============================================================
// 🎙️ Voice
// ============================================================

let currentConnection = null;


// ============================================================
// 🌐 Express
// ============================================================

const app = express();

app.use(express.json());


app.get("/", (req, res) => {

    const uptimeHours =
        voiceSessionStartTime

            ? (
                (
                    Date.now() -
                    voiceSessionStartTime
                ) /
                (1000 * 60 * 60)
            ).toFixed(2)

            : 0;


    res.send(
        `HERTZ ADMIN BOT is running. | Voice: ${uptimeHours}h`
    );

});


// ============================================================
// 🔐 التحقق من الرول
// ============================================================

async function isAuthorizedFast(
    guild,
    userId
) {

    try {

        let member =
            guild.members.cache.get(
                userId
            );


        if (!member) {

            try {

                member =
                    await guild.members.fetch(
                        userId
                    );

            } catch (e) {

                return false;

            }

        }


        if (!member) {
            return false;
        }


        return member.roles.cache.has(
            AUTHORIZED_ROLE_ID
        );


    } catch (err) {

        return false;

    }

}


// ============================================================
// 📜 نشر القوانين
// ============================================================

async function deployRules(
    guild,
    silent = false
) {

    const everyoneRole =
        guild.roles.everyone;


    let generalRulesText = "";

    try {

        generalRulesText =
            fs.readFileSync(
                "./rules-general.txt",
                "utf8"
            );

    } catch (e) {

        generalRulesText =
            "القوانين العامة غير متوفرة حالياً في ملف التكست.";

    }


    let adminRulesText = "";

    try {

        adminRulesText =
            fs.readFileSync(
                "./rules-admin.txt",
                "utf8"
            );

    } catch (e) {

        adminRulesText =
            "قوانين الإدارة غير متوفرة حالياً في ملف التكست.";

    }


    // --------------------------------------------------------
    // القوانين العامة
    // --------------------------------------------------------

    try {

        const generalChannel =
            await guild.channels
                .fetch(
                    GENERAL_RULES_CHANNEL_ID
                )
                .catch(() => null);


        if (!generalChannel) {

            return {
                success: false,
                message:
                    "روم القوانين العامة مش موجود!"
            };

        }


        const botMember =
            guild.members.me;


        const perms =
            generalChannel.permissionsFor(
                botMember
            );


        if (
            !perms ||
            !perms.has(
                PermissionFlagsBits.SendMessages
            )
        ) {

            return {
                success: false,
                message:
                    "البوت مش عنده صلاحية إرسال!"
            };

        }


        const generalEmbed =
            new EmbedBuilder()

                .setColor(0x2b2d31)

                .setTitle(
                    "📜 مرحباً بكم في قوانين سيرفرنا"
                )

                .setDescription(
                    generalRulesText
                )

                .setImage(
                    RULES_IMAGE_URL
                )

                .setFooter({

                    text:
                        `${SERVER_NAME} • القوانين العامة`,

                    iconURL:
                        guild.iconURL({
                            dynamic: true
                        }) || undefined

                })

                .setTimestamp();


        await generalChannel.send({

            content:
                `${everyoneRole} **يرجى قراءة القوانين بعناية**`,

            embeds: [
                generalEmbed
            ]

        });


        if (!silent) {

            console.log(
                "✅ [RULES] القوانين العامة اتنشرت!"
            );

        }


    } catch (err) {

        console.error(
            "❌ [RULES]",
            err.message
        );

        return {
            success: false,
            message: "خطأ!"
        };

    }


    // --------------------------------------------------------
    // قوانين الإدارة
    // --------------------------------------------------------

    try {

        const adminChannel =
            await guild.channels
                .fetch(
                    ADMIN_RULES_CHANNEL_ID
                )
                .catch(() => null);


        if (!adminChannel) {

            return {
                success: false,
                message:
                    "روم قوانين الإدارة مش موجود!"
            };

        }


        const botMember =
            guild.members.me;


        const perms =
            adminChannel.permissionsFor(
                botMember
            );


        if (
            !perms ||
            !perms.has(
                PermissionFlagsBits.SendMessages
            )
        ) {

            return {
                success: false,
                message:
                    "البوت مش عنده صلاحية إرسال!"
            };

        }


        const adminEmbed =
            new EmbedBuilder()

                .setColor(0x2b2d31)

                .setTitle(
                    "📜 مرحباً بكم في قوانين الإدارة"
                )

                .setDescription(
                    adminRulesText
                )

                .setImage(
                    ADMIN_RULES_IMAGE_URL
                )

                .setFooter({

                    text:
                        `${SERVER_NAME} • قوانين الإدارة`,

                    iconURL:
                        guild.iconURL({
                            dynamic: true
                        }) || undefined

                })

                .setTimestamp();


        await adminChannel.send({

            content:
                `${everyoneRole} **يرجى قراءة قوانين الإدارة بعناية**`,

            embeds: [
                adminEmbed
            ]

        });


        if (!silent) {

            console.log(
                "✅ [RULES] قوانين الإدارة اتنشرت!"
            );

        }


    } catch (err) {

        console.error(
            "❌ [RULES]",
            err.message
        );

        return {
            success: false,
            message: "خطأ!"
        };

    }


    return {

        success: true,

        message:
            "✅ تم نشر القوانين بنجاح!"

    };

}


// ============================================================
// 👋 الترحيب - النظام الجديد
// ============================================================

async function sendWelcomeMessage(
    guild,
    member
) {

    if (
        !guild ||
        !member ||
        member.user?.bot
    ) {

        return;

    }


    const memberId =
        member.id;


    // --------------------------------------------------------
    // مفتاح ثابت للعضو
    // --------------------------------------------------------

    const lockKey =
        `${guild.id}:${memberId}`;


    // --------------------------------------------------------
    // منع التنفيذ المتزامن
    // --------------------------------------------------------

    if (
        welcomeLocks.has(
            lockKey
        )
    ) {

        console.log(
            `🛑 [WELCOME LOCK] تم منع تكرار ${memberId}`
        );

        return;

    }


    welcomeLocks.add(
        lockKey
    );


    try {

        // ----------------------------------------------------
        // Cooldown
        // ----------------------------------------------------

        const lastWelcome =
            welcomeCooldown.get(
                lockKey
            );


        if (
            lastWelcome &&
            Date.now() - lastWelcome <
            MEMBER_EVENT_COOLDOWN
        ) {

            console.log(
                `🛑 [WELCOME COOLDOWN] ${memberId}`
            );

            return;

        }


        // ----------------------------------------------------
        // Timestamp خاص بالدخول
        // ----------------------------------------------------

        const joinedAt =
            member.joinedTimestamp ||
            Date.now();


        const eventId =
            createEventId(
                "WELCOME",
                guild.id,
                memberId,
                joinedAt
            );


        const eventMarker =
            `[HERTZ_EVENT:${eventId}]`;


        // ----------------------------------------------------
        // قاعدة البيانات المحلية
        // ----------------------------------------------------

        if (
            wasEventProcessed(
                "welcomes",
                eventId
            )
        ) {

            console.log(
                `🛑 [WELCOME DATABASE] ${memberId}`
            );

            welcomeCooldown.set(
                lockKey,
                Date.now()
            );

            return;

        }


        // ----------------------------------------------------
        // روم الترحيب
        // ----------------------------------------------------

        const welcomeChannel =
            await guild.channels
                .fetch(
                    WELCOME_CHANNEL_ID
                )
                .catch(() => null);


        if (
            !welcomeChannel ||
            !welcomeChannel.isTextBased()
        ) {

            console.error(
                "❌ [WELCOME] روم الترحيب غير موجود"
            );

            return;

        }


        // ----------------------------------------------------
        // فحص Discord نفسه
        // ----------------------------------------------------

        const alreadyExists =
            await findExistingEventMessage(
                welcomeChannel,
                eventMarker
            );


        if (alreadyExists) {

            console.log(
                `🛑 [WELCOME DISCORD CHECK] تم منع رسالة مكررة للعضو ${memberId}`
            );


            markEventProcessed(
                "welcomes",
                eventId
            );


            welcomeCooldown.set(
                lockKey,
                Date.now()
            );


            return;

        }


        // ----------------------------------------------------
        // إضافة الرول
        // ----------------------------------------------------

        try {

            const role =
                guild.roles.cache.get(
                    AUTO_ROLE_ID
                );


            if (
                role &&
                !member.roles.cache.has(
                    AUTO_ROLE_ID
                )
            ) {

                await member.roles.add(
                    role,
                    "رول تلقائي"
                );

            }

        } catch (e) {

            console.error(
                "❌ [AUTO ROLE]",
                e.message
            );

        }


        // ----------------------------------------------------
        // إنشاء Embed
        // ----------------------------------------------------

        const embed =
            new EmbedBuilder()

                .setColor(0x5865F2)

                .setTitle(
                    "مرحباً بك في السيرفر"
                )

                .setDescription(

                    `أهلاً بك يا <@${memberId}> في سيرفر **${SERVER_NAME}**\n\n${eventMarker}`

                )

                .setImage(
                    WELCOME_IMAGE_URL
                )

                .setThumbnail(
                    member.user.displayAvatarURL({
                        dynamic: true,
                        size: 256
                    })
                )

                .setTimestamp();


        // ----------------------------------------------------
        // إرسال مرة واحدة
        // ----------------------------------------------------

        const sent =
            await sendUniqueEventMessage(

                welcomeChannel,

                eventMarker,

                {

                    embeds: [
                        embed
                    ],

                    allowedMentions: {

                        users: [
                            memberId
                        ]

                    }

                }

            );


        // ----------------------------------------------------
        // تسجيل الحدث
        // ----------------------------------------------------

        if (sent) {

            markEventProcessed(
                "welcomes",
                eventId
            );

        }


        welcomeCooldown.set(
            lockKey,
            Date.now()
        );


    } catch (error) {

        console.error(
            "❌ [WELCOME]",
            error.message
        );


    } finally {

        welcomeLocks.delete(
            lockKey
        );

    }

}


// ============================================================
// 🚪 المغادرة - النظام الجديد
// ============================================================

async function sendLeaveMessage(
    guild,
    memberId,
    memberTag
) {

    if (
        !guild ||
        !memberId
    ) {

        return;

    }


    const lockKey =
        `${guild.id}:${memberId}`;


    // --------------------------------------------------------
    // منع التنفيذ المتزامن
    // --------------------------------------------------------

    if (
        leaveLocks.has(
            lockKey
        )
    ) {

        console.log(
            `🛑 [LEAVE LOCK] تم منع تكرار ${memberId}`
        );

        return;

    }


    leaveLocks.add(
        lockKey
    );


    try {

        // ----------------------------------------------------
        // Cooldown
        // ----------------------------------------------------

        const lastLeave =
            leaveCooldown.get(
                lockKey
            );


        if (
            lastLeave &&
            Date.now() - lastLeave <
            MEMBER_EVENT_COOLDOWN
        ) {

            console.log(
                `🛑 [LEAVE COOLDOWN] ${memberId}`
            );

            return;

        }


        // ----------------------------------------------------
        // Event ID للمغادرة
        // ----------------------------------------------------

        const eventId =
            createEventId(
                "LEAVE",
                guild.id,
                memberId,
                Date.now()
            );


        // لأن وقت المغادرة نفسه ممكن يختلف،
        // بنستخدم Marker ثابت للعضو داخل فترة الحماية.

        const eventMarker =
            `[HERTZ_LEAVE:${guild.id}:${memberId}]`;


        // ----------------------------------------------------
        // روم المغادرة
        // ----------------------------------------------------

        const leaveChannel =
            await guild.channels
                .fetch(
                    LEAVE_CHANNEL_ID
                )
                .catch(() => null);


        if (
            !leaveChannel ||
            !leaveChannel.isTextBased()
        ) {

            console.error(
                "❌ [LEAVE] روم المغادرة غير موجود"
            );

            return;

        }


        // ----------------------------------------------------
        // فحص آخر الرسائل
        // ----------------------------------------------------

        const alreadyExists =
            await findExistingEventMessage(
                leaveChannel,
                eventMarker
            );


        if (alreadyExists) {

            console.log(
                `🛑 [LEAVE DISCORD CHECK] تم منع مغادرة مكررة للعضو ${memberId}`
            );


            leaveCooldown.set(
                lockKey,
                Date.now()
            );


            return;

        }


        // ----------------------------------------------------
        // إرسال
        // ----------------------------------------------------

        await leaveChannel.send({

            content:
                `**غادر** <@${memberId}>\n${eventMarker}`,

            allowedMentions: {

                users: [
                    memberId
                ]

            }

        });


        // ----------------------------------------------------
        // تسجيل
        // ----------------------------------------------------

        markEventProcessed(
            "leaves",
            eventId
        );


        leaveCooldown.set(
            lockKey,
            Date.now()
        );


        console.log(
            `✅ [LEAVE] تم إرسال مغادرة واحدة فقط لـ ${memberTag || memberId}`
        );


    } catch (error) {

        console.error(
            "❌ [LEAVE]",
            error.message
        );


    } finally {

        leaveLocks.delete(
            lockKey
        );

    }

}


// ============================================================
// 🟢 دخول عضو - Event واحد فقط
// ============================================================

client.on(
    "guildMemberAdd",
    async (member) => {

        try {

            if (
                member.guild.id !==
                GUILD_ID
            ) {

                return;

            }


            if (
                member.user?.bot
            ) {

                return;

            }


            await sendWelcomeMessage(
                member.guild,
                member
            );


        } catch (error) {

            console.error(
                "❌ [MEMBER ADD]",
                error.message
            );

        }

    }
);


// ============================================================
// 🔴 خروج عضو - Event واحد فقط
// ============================================================

client.on(
    "guildMemberRemove",
    async (member) => {

        try {

            if (
                member.guild.id !==
                GUILD_ID
            ) {

                return;

            }


            if (
                member.user?.bot
            ) {

                return;

            }


            await sendLeaveMessage(

                member.guild,

                member.id,

                member.user?.tag ||
                member.id

            );


        } catch (error) {

            console.error(
                "❌ [MEMBER REMOVE]",
                error.message
            );

        }

    }
);


// ============================================================
// 🛡️ حماية الروابط والسبام
// ============================================================

client.on(
    "messageCreate",
    async (message) => {

        if (
            message.author.bot ||
            !message.guild
        ) {

            return;

        }


        const isAdmin =
            await isAuthorizedFast(
                message.guild,
                message.author.id
            );


        if (isAdmin) {
            return;
        }


        const userId =
            message.author.id;


        const currentTime =
            Date.now();


        const linkRegex =
            /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9][-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*))/gi;


        if (
            linkRegex.test(
                message.content
            )
        ) {

            try {

                await message.delete()
                    .catch(() => {});


                let userRecord =
                    linkSpamMap.get(
                        userId
                    ) || {
                        count: 0,
                        lastTime:
                            currentTime
                    };


                if (
                    currentTime -
                    userRecord.lastTime <
                    LINK_SPAM_WINDOW
                ) {

                    userRecord.count += 1;

                } else {

                    userRecord.count = 1;

                }


                userRecord.lastTime =
                    currentTime;


                linkSpamMap.set(
                    userId,
                    userRecord
                );


                if (
                    userRecord.count >=
                    LINK_SPAM_THRESHOLD
                ) {

                    try {

                        const member =
                            await message.guild.members.fetch(
                                userId
                            );


                        await member.timeout(

                            LINK_TIMEOUT_DURATION,

                            "إرسال روابط متكررة"

                        );


                        linkSpamMap.delete(
                            userId
                        );


                        const warningMsg =
                            await message.channel.send(

                                `⚠️ ${message.author} تم إعطاؤك **تايم أوت لمدة ساعة** بسبب إرسال الروابط المتكررة.`

                            );


                        setTimeout(
                            () => {

                                warningMsg
                                    .delete()
                                    .catch(() => {});

                            },

                            LINK_WARNING_DURATION
                        );


                        return;

                    } catch (err) {}

                }


                const firstWarning =
                    await message.channel.send(

                        `⚠️ ${message.author} ممنوع نشر الروابط! التكرار سيؤدي إلى تايم أوت.`

                    );


                setTimeout(
                    () => {

                        firstWarning
                            .delete()
                            .catch(() => {});

                    },

                    LINK_WARNING_DURATION
                );


                return;


            } catch (e) {}

        }


        try {

            let textRecord =
                textSpamMap.get(
                    userId
                ) || {
                    timestamps: []
                };


            textRecord.timestamps =
                textRecord.timestamps.filter(
                    ts =>
                        currentTime - ts <
                        TEXT_SPAM_WINDOW
                );


            textRecord.timestamps.push(
                currentTime
            );


            textSpamMap.set(
                userId,
                textRecord
            );


            if (
                textRecord.timestamps.length >=
                TEXT_SPAM_THRESHOLD
            ) {

                try {

                    const member =
                        await message.guild.members.fetch(
                            userId
                        );


                    await member.timeout(

                        TEXT_SPAM_TIMEOUT,

                        "إرسال رسائل سبام"

                    );


                    textSpamMap.delete(
                        userId
                    );


                    const warningMsg =
                        await message.channel.send(

                            `⚠️ ${message.author} تم إعطاؤك **تايم أوت لمدة 10 دقائق** بسبب السبام.`

                        );


                    setTimeout(
                        () => {

                            warningMsg
                                .delete()
                                .catch(() => {});

                        },

                        LINK_WARNING_DURATION
                    );


                    return;

                } catch (err) {}

            }


        } catch (e) {}

    }
);


// ============================================================
// 📦 نقل الرسائل
// ============================================================

client.on(
    "messageReactionAdd",
    async (reaction, user) => {

        if (user.bot) {
            return;
        }


        if (reaction.partial) {

            try {

                await reaction.fetch();

            } catch (e) {

                return;

            }

        }


        const message =
            reaction.message;


        if (message.partial) {

            try {

                await message.fetch();

            } catch (e) {

                return;

            }

        }


        if (!message.guild) {
            return;
        }


        const messageId =
            message.id;


        if (
            movedMessages.has(
                messageId
            )
        ) {

            return;

        }


        if (
            sourceMessagesDeleted.has(
                messageId
            )
        ) {

            return;

        }


        if (
            processingLocks.has(
                messageId
            )
        ) {

            return;

        }


        processingLocks.add(
            messageId
        );


        try {

            const isTargetChannel =

                message.channelId ===
                    SUPPORT_CHANNEL_ID ||

                message.channelId ===
                    ORDER_CHANNEL_ID ||

                message.channelId ===
                    CANCEL_CHANNEL_ID;


            if (!isTargetChannel) {

                return;

            }


            const authorized =
                await isAuthorizedFast(
                    message.guild,
                    user.id
                );


            if (!authorized) {
                return;
            }


            if (
                reaction.emoji.name !==
                "✅"
            ) {

                return;

            }


            let targetVaultId =
                null;


            if (
                message.channelId ===
                SUPPORT_CHANNEL_ID
            ) {

                targetVaultId =
                    TRASH_SUPPORT_CHANNEL_ID;

            } else if (
                message.channelId ===
                ORDER_CHANNEL_ID
            ) {

                targetVaultId =
                    TRASH_ORDER_CHANNEL_ID;

            } else if (
                message.channelId ===
                CANCEL_CHANNEL_ID
            ) {

                targetVaultId =
                    TRASH_CANCEL_CHANNEL_ID;

            }


            if (!targetVaultId) {
                return;
            }


            const vaultKey =
                `${targetVaultId}:${messageId}`;


            if (
                vaultMessages.has(
                    vaultKey
                )
            ) {

                return;

            }


            movedMessages.add(
                messageId
            );


            vaultMessages.add(
                vaultKey
            );


            try {

                const targetVault =
                    await client.channels.fetch(
                        targetVaultId
                    );


                if (!targetVault) {

                    movedMessages.delete(
                        messageId
                    );

                    vaultMessages.delete(
                        vaultKey
                    );

                    return;

                }


                const msgContent =
                    message.content || "";


                const msgEmbeds =
                    message.embeds || [];


                const msgFiles =
                    message.attachments
                        ? Array.from(
                            message.attachments.values()
                        ).map(
                            att => att.url
                        )
                        : [];


                await targetVault.send({

                    content:
                        `👤 **بواسطة:** <@${user.id}>\n📜 **المحتوى:**\n${msgContent !== ""
                            ? msgContent
                            : "**[مرفقات]**"}`,

                    embeds:
                        msgEmbeds,

                    files:
                        msgFiles

                });


                sourceMessagesDeleted.add(
                    messageId
                );


                await message.delete()
                    .catch(() => {});


            } catch (e) {

                movedMessages.delete(
                    messageId
                );

                vaultMessages.delete(
                    vaultKey
                );

            }


        } finally {

            processingLocks.delete(
                messageId
            );

        }

    }
);


// ============================================================
// 🎫 إنشاء Ticket
// ============================================================

client.on(
    "channelCreate",
    async (channel) => {

        try {

            if (!channel.guild) {
                return;
            }


            const n =
                channel.name.toLowerCase();


            if (
                n.includes("ticket") ||
                n.includes("تيكت")
            ) {

                const v =
                    await channel.guild.channels
                        .fetch(
                            TICKET_VOICE_CHANNEL_ID
                        )
                        .catch(() => null);


                if (v) {

                    await v.permissionOverwrites.edit(

                        channel.guild.roles.everyone,

                        {
                            [PermissionFlagsBits.ViewChannel]:
                                true,

                            [PermissionFlagsBits.Connect]:
                                true

                        }

                    );

                }

            }


        } catch (e) {}

    }
);


// ============================================================
// 🗑️ حذف Ticket
// ============================================================

client.on(
    "channelDelete",
    async (channel) => {

        try {

            if (!channel.guild) {
                return;
            }


            const n =
                channel.name.toLowerCase();


            if (
                n.includes("ticket") ||
                n.includes("تيكت")
            ) {

                const v =
                    await channel.guild.channels
                        .fetch(
                            TICKET_VOICE_CHANNEL_ID
                        )
                        .catch(() => null);


                if (v) {

                    await v.permissionOverwrites.edit(

                        channel.guild.roles.everyone,

                        {
                            [PermissionFlagsBits.ViewChannel]:
                                false,

                            [PermissionFlagsBits.Connect]:
                                false

                        }

                    );

                }

            }


        } catch (e) {}

    }
);


// ============================================================
// 🎙️ Voice
// ============================================================

async function connectToVoiceChannel() {

    try {

        const channel =
            await client.channels.fetch(
                TARGET_VOICE_CHANNEL_ID
            );


        if (
            !channel ||
            channel.type !==
            ChannelType.GuildVoice
        ) {

            return;

        }


        const connection =
            joinVoiceChannel({

                channelId:
                    channel.id,

                guildId:
                    channel.guild.id,

                adapterCreator:
                    channel.guild.voiceAdapterCreator,

                selfDeaf:
                    false,

                selfMute:
                    false

            });


        currentConnection =
            connection;


        connection.on(
            VoiceConnectionStatus.Ready,
            () => {

                if (
                    !voiceSessionStartTime
                ) {

                    voiceSessionStartTime =
                        Date.now();

                }

            }
        );


        connection.on(
            VoiceConnectionStatus.Disconnected,
            async () => {

                try {

                    await entersState(

                        connection,

                        VoiceConnectionStatus.Signalling,

                        1000

                    );

                } catch (e) {

                    try {

                        connection.destroy();

                    } catch (err) {}


                    setTimeout(
                        connectToVoiceChannel,
                        200
                    );

                }

            }
        );


        connection.on(
            "error",
            () => {

                try {

                    connection.destroy();

                } catch (e) {}


                setTimeout(
                    connectToVoiceChannel,
                    200
                );

            }
        );


    } catch (e) {

        setTimeout(
            connectToVoiceChannel,
            1000
        );

    }

}


// ============================================================
// 🤖 READY
// ============================================================

client.once(
    "ready",
    async () => {

        console.log(
            "\n============================================"
        );

        console.log(
            `✅ HERTZ ADMIN BOT: ${client.user.tag}`
        );

        console.log(
            "🛡️ WELCOME/LEAVE ANTI-SPAM: ENABLED"
        );

        console.log(
            "============================================\n"
        );


        // ----------------------------------------------------
        // Slash Commands
        // ----------------------------------------------------

        const rest =
            new REST({
                version: "10"
            }).setToken(
                process.env.DISCORD_TOKEN
            );


        try {

            const commands = [

                new SlashCommandBuilder()

                    .setName("clear")

                    .setDescription(
                        "حذف رسائل (خاص بالإدارة)"
                    )

                    .addIntegerOption(
                        o =>
                            o

                                .setName("count")

                                .setDescription(
                                    "العدد (1-100)"
                                )

                                .setRequired(
                                    true
                                )

                                .setMinValue(
                                    1
                                )

                                .setMaxValue(
                                    100
                                )
                    ),


                new SlashCommandBuilder()

                    .setName("sendrules")

                    .setDescription(
                        "نشر القوانين (خاص بالإدارة)"
                    )

            ].map(
                c => c.toJSON()
            );


            await rest.put(

                Routes.applicationCommands(
                    client.user.id
                ),

                {
                    body:
                        commands
                }

            );


        } catch (e) {}


        // ----------------------------------------------------
        // نشر القوانين
        // ----------------------------------------------------

        setTimeout(
            async () => {

                try {

                    const guild =
                        client.guilds.cache.get(
                            GUILD_ID
                        ) ||
                        client.guilds.cache.first();


                    if (guild) {

                        await deployRules(
                            guild,
                            false
                        );

                    }

                } catch (e) {}

            },

            3000
        );


        // ----------------------------------------------------
        // Voice
        // ----------------------------------------------------

        connectToVoiceChannel();


        // ----------------------------------------------------
        // فحص Voice
        // ----------------------------------------------------

        setInterval(
            () => {

                try {

                    if (

                        !currentConnection ||

                        currentConnection.state.status ===
                            VoiceConnectionStatus.Disconnected ||

                        currentConnection.state.status ===
                            VoiceConnectionStatus.Destroyed

                    ) {

                        connectToVoiceChannel();

                    }

                } catch (e) {

                    connectToVoiceChannel();

                }

            },

            10 * 1000
        );

    }
);


// ============================================================
// ⚙️ Slash Commands
// ============================================================

client.on(
    "interactionCreate",
    async interaction => {

        if (
            !interaction.isChatInputCommand()
        ) {

            return;

        }


        // ====================================================
        // CLEAR
        // ====================================================

        if (
            interaction.commandName ===
            "clear"
        ) {

            const userId =
                interaction.user.id;


            if (
                clearProcessing.has(
                    userId
                )
            ) {

                await interaction.reply({

                    content:
                        "⏳ في عملية مسح جارية بالفعل.",

                    ephemeral:
                        true

                });

                return;

            }


            clearProcessing.add(
                userId
            );


            try {

                const authorized =
                    await isAuthorizedFast(
                        interaction.guild,
                        userId
                    );


                if (!authorized) {

                    await interaction.reply({

                        content:
                            "❌ للإدارة فقط!",

                        ephemeral:
                            true

                    });

                    return;

                }


                const count =
                    interaction.options.getInteger(
                        "count"
                    );


                if (
                    !interaction.channel ||
                    !interaction.channel.isTextBased()
                ) {

                    await interaction.reply({

                        content:
                            "❌ الأمر ده في الرومات النصية بس!",

                        ephemeral:
                            true

                    });

                    return;

                }


                await interaction.deferReply({
                    ephemeral: true
                });


                const deleted =
                    await interaction.channel.bulkDelete(
                        count,
                        true
                    );


                if (
                    deleted.size === 0
                ) {

                    await interaction.editReply({

                        content:
                            "⚠️ مفيش رسائل اتحذفت (ممكن تكون أقدم من 14 يوم أو مفيش رسائل)."

                    });

                } else {

                    await interaction.editReply({

                        content:
                            `✅ تم حذف **${deleted.size}** رسالة بنجاح.`

                    });

                }


            } catch (e) {

                try {

                    await interaction.editReply({

                        content:
                            `❌ خطأ: ${e.message}`

                    });

                } catch (err) {}


            } finally {

                clearProcessing.delete(
                    userId
                );

            }

        }


        // ====================================================
        // SEND RULES
        // ====================================================

        if (
            interaction.commandName ===
            "sendrules"
        ) {

            const userId =
                interaction.user.id;


            if (
                rulesProcessing.has(
                    userId
                )
            ) {

                await interaction.reply({

                    content:
                        "⏳",

                    ephemeral:
                        true

                });

                return;

            }


            rulesProcessing.add(
                userId
            );


            try {

                const authorized =
                    await isAuthorizedFast(
                        interaction.guild,
                        userId
                    );


                if (!authorized) {

                    await interaction.reply({

                        content:
                            "❌ للإدارة فقط!",

                        ephemeral:
                            true

                    });

                    return;

                }


                await interaction.deferReply({
                    ephemeral: true
                });


                const result =
                    await deployRules(
                        interaction.guild,
                        true
                    );


                await interaction.editReply({

                    content:
                        result.message

                });


            } catch (e) {

                try {

                    await interaction.editReply({

                        content:
                            "❌ خطأ."

                    });

                } catch (err) {}


            } finally {

                rulesProcessing.delete(
                    userId
                );

            }

        }

    }
);


// ============================================================
// 🚨 أخطاء
// ============================================================

process.on(
    "unhandledRejection",
    (reason) => {

        console.error(
            "❌ [UNHANDLED REJECTION]",
            reason
        );

    }
);


process.on(
    "uncaughtException",
    (error) => {

        console.error(
            "❌ [UNCAUGHT EXCEPTION]",
            error
        );

    }
);


// ============================================================
// 🌐 Server
// ============================================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `🌐 Port ${PORT}`
        );

    }
);


// ============================================================
// 🔑 Login
// ============================================================

client.login(
    process.env.DISCORD_TOKEN
)
.catch(
    error =>
        console.error(
            "❌ [LOGIN]",
            error.message
        )
);

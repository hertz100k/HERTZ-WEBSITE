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
// 🛡️ Sets لمنع التكرار
// ============================================================

const movedMessages = new Set();
const processingLocks = new Set();
const sourceMessagesDeleted = new Set();
const vaultMessages = new Set();


// ============================================================
// 🛡️ نظام حماية الترحيب والمغادرة من التكرار
// ============================================================

const welcomeProcessing = new Set();
const leaveProcessing = new Set();

const welcomeSent = new Set();
const leaveSent = new Set();


// ============================================================
// 💾 ملف حفظ حالة الدخول والخروج
// ============================================================

const EVENT_DEDUPE_FILE = "./event-dedupe.json";

const EVENT_DEDUPE_MAX_AGE =
    7 * 24 * 60 * 60 * 1000;


let eventDedupe = {
    activeJoins: {},
    processedJoins: {},
    processedLeaves: {}
};


// ============================================================
// 💾 تحميل سجل منع التكرار
// ============================================================

function loadEventDedupe() {
    try {

        if (!fs.existsSync(EVENT_DEDUPE_FILE)) {
            return;
        }

        const raw = fs.readFileSync(
            EVENT_DEDUPE_FILE,
            "utf8"
        );

        if (!raw.trim()) {
            return;
        }

        const parsed = JSON.parse(raw);

        if (parsed && typeof parsed === "object") {

            eventDedupe = {

                activeJoins:
                    parsed.activeJoins || {},

                processedJoins:
                    parsed.processedJoins || {},

                processedLeaves:
                    parsed.processedLeaves || {}

            };
        }

    } catch (e) {

        console.error(
            "❌ [DEDUPE LOAD]",
            e.message
        );

    }
}


// ============================================================
// 🧹 تنظيف البيانات القديمة
// ============================================================

function cleanupEventDedupe() {

    const cutoff =
        Date.now() - EVENT_DEDUPE_MAX_AGE;


    for (
        const collectionName
        of [
            "activeJoins",
            "processedJoins",
            "processedLeaves"
        ]
    ) {

        const collection =
            eventDedupe[collectionName];


        for (
            const [key, value]
            of Object.entries(collection)
        ) {

            const timestamp =
                Number(
                    value?.timestamp ||
                    value ||
                    0
                );


            if (
                !timestamp ||
                timestamp < cutoff
            ) {

                delete collection[key];

            }
        }
    }
}


// ============================================================
// 💾 حفظ البيانات بشكل آمن
// ============================================================

function saveEventDedupe() {

    try {

        cleanupEventDedupe();


        const tempFile =
            `${EVENT_DEDUPE_FILE}.tmp`;


        fs.writeFileSync(
            tempFile,
            JSON.stringify(
                eventDedupe,
                null,
                2
            ),
            "utf8"
        );


        fs.renameSync(
            tempFile,
            EVENT_DEDUPE_FILE
        );


    } catch (e) {

        console.error(
            "❌ [DEDUPE SAVE]",
            e.message
        );

    }
}


// ============================================================
// 🟢 تسجيل دخول تم تنفيذه
// ============================================================

function markJoinProcessed(
    guildId,
    memberId,
    joinTimestamp
) {

    const key =
        `${guildId}:${memberId}:${joinTimestamp}`;


    eventDedupe.processedJoins[key] = {
        timestamp: Date.now()
    };


    eventDedupe.activeJoins[
        `${guildId}:${memberId}`
    ] = {

        joinTimestamp,

        timestamp: Date.now()

    };


    saveEventDedupe();


    return key;
}


// ============================================================
// 🔴 تسجيل مغادرة تم تنفيذها
// ============================================================

function markLeaveProcessed(
    guildId,
    memberId,
    joinTimestamp
) {

    const key =
        `${guildId}:${memberId}:${joinTimestamp || "unknown"}`;


    eventDedupe.processedLeaves[key] = {
        timestamp: Date.now()
    };


    delete eventDedupe.activeJoins[
        `${guildId}:${memberId}`
    ];


    saveEventDedupe();


    return key;
}


// ============================================================
// 🔑 إنشاء مفتاح دخول ثابت
// ============================================================

function getJoinKey(
    guildId,
    memberId,
    joinTimestamp
) {

    return `${guildId}:${memberId}:${joinTimestamp}`;

}


// ============================================================
// 💾 تحميل سجل الأحداث
// ============================================================

loadEventDedupe();

cleanupEventDedupe();


// ============================================================
// 🛡️ أوامر الإدارة
// ============================================================

const clearProcessing = new Set();

const rulesProcessing = new Set();

const linkSpamMap = new Map();

const textSpamMap = new Map();


// ============================================================
// 🔍 فحص Environment
// ============================================================

console.log("\n🔍 [ENV CHECK]:");

console.log(
    "   DISCORD_TOKEN:",
    process.env.DISCORD_TOKEN
        ? "✅"
        : "❌"
);


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
            guild.members.cache.get(userId);


        if (!member) {

            try {

                member =
                    await guild.members.fetch(userId);

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


    // --------------------------------------------------------
    // القوانين العامة
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // قوانين الإدارة
    // --------------------------------------------------------

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
    // نشر العامة
    // --------------------------------------------------------

    try {

        const generalChannel =
            await guild.channels
                .fetch(GENERAL_RULES_CHANNEL_ID)
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
    // نشر قوانين الإدارة
    // --------------------------------------------------------

    try {

        const adminChannel =
            await guild.channels
                .fetch(ADMIN_RULES_CHANNEL_ID)
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
// 👋 الترحيب
// Event مباشر + Lock + Persistent Dedupe
// ============================================================

async function sendWelcomeMessage(
    guild,
    member
) {

    const memberId =
        member.id;


    if (
        !member ||
        member.user?.bot
    ) {

        return;

    }


    // وقت دخول العضو للسيرفر
    const joinTimestamp =
        Number(
            member.joinedTimestamp ||
            Date.now()
        );


    // مفتاح ثابت لنفس جلسة الدخول
    const joinKey =
        getJoinKey(
            guild.id,
            memberId,
            joinTimestamp
        );


    // --------------------------------------------------------
    // 🛡️ منع أي تنفيذ مزدوج
    // --------------------------------------------------------

    if (
        welcomeProcessing.has(joinKey)
    ) {

        return;

    }


    if (
        welcomeSent.has(joinKey)
    ) {

        return;

    }


    if (
        eventDedupe.processedJoins[joinKey]
    ) {

        return;

    }


    welcomeProcessing.add(
        joinKey
    );


    try {

        // مهم جداً:
        // بنسجل الحدث قبل await عشان لو نفس الحدث وصل
        // تاني أثناء الإرسال، مايتبعتش مرة ثانية.

        welcomeSent.add(
            joinKey
        );


        markJoinProcessed(
            guild.id,
            memberId,
            joinTimestamp
        );


        // ----------------------------------------------------
        // إضافة الرول تلقائياً
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
        // روم الترحيب
        // ----------------------------------------------------

        const welcomeChannel =
            await guild.channels
                .fetch(WELCOME_CHANNEL_ID)
                .catch(() => null);


        if (
            !welcomeChannel ||
            !welcomeChannel.isTextBased()
        ) {

            return;

        }


        // ----------------------------------------------------
        // رسالة الترحيب
        // ----------------------------------------------------

        const embed =
            new EmbedBuilder()

                .setColor(0x5865F2)

                .setTitle(
                    "مرحباً بك في السيرفر"
                )

                .setDescription(
                    `أهلاً بك يا <@${memberId}> في سيرفر **${SERVER_NAME}**`
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


        await welcomeChannel.send({

            embeds: [
                embed
            ],

            allowedMentions: {
                users: [
                    memberId
                ]
            }

        });


        console.log(
            `✅ [WELCOME] تم إرسال ترحيب واحد فقط لـ ${member.user.tag} (${memberId})`
        );


    } catch (e) {

        console.error(
            "❌ [WELCOME]",
            e.message
        );

    } finally {

        welcomeProcessing.delete(
            joinKey
        );

    }

}


// ============================================================
// 👋 المغادرة
// Event مباشر + Lock + Persistent Dedupe
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


    const activeKey =
        `${guild.id}:${memberId}`;


    const activeJoin =
        eventDedupe.activeJoins[
            activeKey
        ];


    const joinTimestamp =
        activeJoin?.joinTimestamp ||
        "unknown";


    const leaveKey =
        `${guild.id}:${memberId}:${joinTimestamp}`;


    // --------------------------------------------------------
    // 🛡️ منع التكرار
    // --------------------------------------------------------

    if (
        leaveProcessing.has(
            leaveKey
        )
    ) {

        return;

    }


    if (
        leaveSent.has(
            leaveKey
        )
    ) {

        return;

    }


    if (
        eventDedupe.processedLeaves[
            leaveKey
        ]
    ) {

        return;

    }


    leaveProcessing.add(
        leaveKey
    );


    try {

        // تسجيل الحدث قبل الإرسال
        leaveSent.add(
            leaveKey
        );


        markLeaveProcessed(
            guild.id,
            memberId,
            joinTimestamp
        );


        const leaveChannel =
            await guild.channels
                .fetch(LEAVE_CHANNEL_ID)
                .catch(() => null);


        if (
            !leaveChannel ||
            !leaveChannel.isTextBased()
        ) {

            return;

        }


        await leaveChannel.send({

            content:
                `**غادر** <@${memberId}>`,

            allowedMentions: {
                users: [
                    memberId
                ]
            }

        });


        console.log(
            `✅ [LEAVE] تم إرسال مغادرة واحدة فقط لـ ${memberTag || memberId}`
        );


    } catch (e) {

        console.error(
            "❌ [LEAVE]",
            e.message
        );

    } finally {

        leaveProcessing.delete(
            leaveKey
        );

    }

}


// ============================================================
// 🟢 دخول عضو
// Discord Event رسمي
// ============================================================

client.on(
    "guildMemberAdd",
    async (member) => {

        try {

            if (!member.guild) {
                return;
            }


            await sendWelcomeMessage(
                member.guild,
                member
            );


        } catch (e) {

            console.error(
                "❌ [MEMBER ADD]",
                e.message
            );

        }

    }
);


// ============================================================
// 🔴 خروج عضو
// Discord Event رسمي
// ============================================================

client.on(
    "guildMemberRemove",
    async (member) => {

        try {

            if (!member.guild) {
                return;
            }


            if (member.user?.bot) {
                return;
            }


            await sendLeaveMessage(

                member.guild,

                member.id,

                member.user?.tag ||
                member.id

            );


        } catch (e) {

            console.error(
                "❌ [MEMBER REMOVE]",
                e.message
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


        // ----------------------------------------------------
        // روابط
        // ----------------------------------------------------

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


                // ------------------------------------------------
                // تايم أوت
                // ------------------------------------------------

                if (
                    userRecord.count >=
                    LINK_SPAM_THRESHOLD
                ) {

                    try {

                        const member =
                            await message.guild.members
                                .fetch(userId);


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


                // ------------------------------------------------
                // تحذير
                // ------------------------------------------------

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


        // ----------------------------------------------------
        // Text Spam
        // ----------------------------------------------------

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
                        await message.guild.members
                            .fetch(userId);


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
// 📦 نقل الرسائل للمخزن
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

                processingLocks.delete(
                    messageId
                );

                return;

            }


            const authorized =
                await isAuthorizedFast(
                    message.guild,
                    user.id
                );


            if (!authorized) {

                processingLocks.delete(
                    messageId
                );

                return;

            }


            if (
                reaction.emoji.name !== "✅"
            ) {

                processingLocks.delete(
                    messageId
                );

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

                processingLocks.delete(
                    messageId
                );

                return;

            }


            const vaultKey =
                `${targetVaultId}:${messageId}`;


            if (
                vaultMessages.has(
                    vaultKey
                )
            ) {

                processingLocks.delete(
                    messageId
                );

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

                    processingLocks.delete(
                        messageId
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
                        `👤 **بواسطة:** <@${user.id}>\n📜 **المحتوى:**\n${msgContent !== "" ? msgContent : "**[مرفقات]**"}`,

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
// 🎙️ الاتصال بالروم الصوتي
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
                    channel.guild
                        .voiceAdapterCreator,

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
// 🤖 Ready
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
            "============================================\n"
        );


        // ----------------------------------------------------
        // Slash Commands
        // ----------------------------------------------------

        const rest =
            new REST({
                version: "10"
            })
                .setToken(
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
        // نشر القوانين بعد تشغيل البوت
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
        // مراقبة Voice
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


                    clearProcessing.delete(
                        userId
                    );


                    return;

                }


                const count =
                    interaction.options
                        .getInteger(
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


                    clearProcessing.delete(
                        userId
                    );


                    return;

                }


                await interaction.deferReply({
                    ephemeral: true
                });


                const deleted =
                    await interaction.channel
                        .bulkDelete(
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


                    rulesProcessing.delete(
                        userId
                    );


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
// 🚨 حماية أخطاء البوت
// ============================================================

process.on(
    "unhandledRejection",
    (r) => {

        console.error(
            "❌ [UNHANDLED REJECTION]",
            r
        );

    }
);


process.on(
    "uncaughtException",
    (e) => {

        console.error(
            "❌ [UNCAUGHT EXCEPTION]",
            e
        );

    }
);


// ============================================================
// 🌐 تشغيل السيرفر
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
// 🔑 تسجيل دخول البوت
// ============================================================

client.login(
    process.env.DISCORD_TOKEN
)
.catch(
    (err) =>
        console.error(
            "❌ [LOGIN]",
            err.message
        )
);

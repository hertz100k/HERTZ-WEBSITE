require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");

const VISIT_CHANNEL_ID = "1549543809132666930";
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

const app = express();

app.use(express.json());

/* الصفحة الرئيسية للسيرفر */
app.get("/", (req, res) => {
    res.status(200).send("HERTZ ADMIN BOT is running.");
});

/* استقبال زيارة جديدة من Supabase */
app.post("/visit", async (req, res) => {
    try {
        /* حماية الـWebhook */
        if (WEBHOOK_SECRET) {
            const receivedSecret = req.get("X-Zeyad-Webhook-Secret");

            if (receivedSecret !== WEBHOOK_SECRET) {
                console.log("❌ Unauthorized webhook request.");
                return res.status(401).send("Unauthorized");
            }
        }

        console.log("📥 New visit received.");

        const channel = await client.channels.fetch(VISIT_CHANNEL_ID);

        if (!channel) {
            console.log("❌ Visit channel not found.");
            return res.status(500).send("Channel not found.");
        }

        const data = req.body || {};

        const totalVisits =
            data.total_visits !== undefined
                ? data.total_visits
                : "غير معروف";

        const record = data.record || {};

        const visitedAt =
            record.visited_at ||
            new Date().toISOString();

        const pageUrl =
            record.page_url ||
            "غير معروف";

        const deviceType =
            record.device_type ||
            "غير معروف";

        const operatingSystem =
            record.operating_system ||
            "غير معروف";

        const browser =
            record.browser ||
            "غير معروف";

        const language =
            record.language ||
            "غير معروف";

        const timezone =
            record.timezone ||
            "غير معروف";

        const embed = {
            color: 0x8b5cf6,

            title: "🟢 زيارة جديدة لموقع HERTZ",

            description:
                "تم تسجيل زيارة جديدة للموقع بنجاح.",

            fields: [
                {
                    name: "👁️ إجمالي الزيارات",
                    value: String(totalVisits),
                    inline: true
                },
                {
                    name: "📱 الجهاز",
                    value: String(deviceType),
                    inline: true
                },
                {
                    name: "💻 نظام التشغيل",
                    value: String(operatingSystem),
                    inline: true
                },
                {
                    name: "🌐 المتصفح",
                    value: String(browser),
                    inline: true
                },
                {
                    name: "🔗 الصفحة",
                    value: String(pageUrl).slice(0, 1024),
                    inline: false
                },
                {
                    name: "🌍 اللغة",
                    value: String(language),
                    inline: true
                },
                {
                    name: "🕐 المنطقة الزمنية",
                    value: String(timezone),
                    inline: true
                }
            ],

            timestamp: visitedAt,

            footer: {
                text: "HERTZ WEBSITE • Visit Monitor"
            }
        };

        await channel.send({
            embeds: [embed]
        });

        console.log("✅ Visit notification sent to Discord.");

        res.status(200).send("OK");

    } catch (error) {
        console.error("❌ Visit webhook error:");
        console.error(error);

        res.status(500).send("Error");
    }
});

/* تشغيل Webhook Server */
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Webhook server running on port ${PORT}`);
});

/* عند تشغيل البوت */
client.once("ready", () => {
    console.log(`✅ البوت اشتغل باسم ${client.user.tag}`);
    console.log(`✅ Visit channel ID: ${VISIT_CHANNEL_ID}`);
    console.log("✅ Webhook server is ready.");
});

/* تسجيل دخول البوت */
client.login(process.env.DISCORD_TOKEN)
    .catch((error) => {
        console.error("❌ فشل تسجيل الدخول إلى Discord:");
        console.error(error);
    });

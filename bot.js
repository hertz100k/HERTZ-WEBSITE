require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");

const VISIT_CHANNEL_ID = "1549543809132666930";
const PORT = process.env.PORT || 3000;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
    res.send("HERTZ ADMIN BOT is running.");
});

app.post("/visit", async (req, res) => {
    try {
        console.log("📥 New visit received.");

        const channel = await client.channels.fetch(VISIT_CHANNEL_ID);

        if (!channel) {
            console.log("❌ Visit channel not found.");
            return res.status(500).send("Channel not found.");
        }

        await channel.send("🟢 زيارة جديدة لموقع HERTZ");

        console.log("✅ Visit notification sent to Discord.");

        res.status(200).send("OK");

    } catch (error) {
        console.error("❌ Visit webhook error:", error);
        res.status(500).send("Error");
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Webhook server running on port ${PORT}`);
});

client.once("ready", () => {
    console.log(`✅ البوت اشتغل باسم ${client.user.tag}`);
    console.log("✅ Supabase connection is ready.");
    console.log(`✅ Visit channel ID: ${VISIT_CHANNEL_ID}`);
});

client.login(process.env.DISCORD_TOKEN)
    .catch((error) => {
        console.error("❌ فشل تسجيل الدخول إلى Discord:");
        console.error(error);
    });

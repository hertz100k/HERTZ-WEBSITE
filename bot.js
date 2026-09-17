require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const VISIT_CHANNEL_ID = "1549543809132666930";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

client.once("ready", async () => {
    console.log(`✅ البوت اشتغل باسم ${client.user.tag}`);

    try {
        const channel = await client.channels.fetch(VISIT_CHANNEL_ID);

        if (!channel) {
            console.log("❌ القناة غير موجودة.");
            return;
        }

        await channel.send("🟢 بوت HERTZ ADMIN متصل ويعمل بنجاح!");
        console.log("✅ تم إرسال رسالة الاختبار إلى Discord.");
    } catch (error) {
        console.error("❌ خطأ أثناء إرسال الرسالة:");
        console.error(error);
    }
});

client.login(DISCORD_TOKEN)
    .catch((error) => {
        console.error("❌ فشل تسجيل الدخول إلى Discord:");
        console.error(error);
    });
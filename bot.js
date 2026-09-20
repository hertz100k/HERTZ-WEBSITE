require("dotenv").config();

const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require("@discordjs/voice");
const { createClient } = require("@supabase/supabase-js");
const express = require("express");

// ============================================================
// 🎯 ثوابت القنوات والرولات
// ============================================================
const VISIT_CHANNEL_ID = "1549529917757325322";       // البيانات الجديدة
const OLD_DATA_CHANNEL_ID = "1549530385908506694";    // البيانات القديمة
const TRASH_CHANNEL_ID = "1549530638627897385";       // سلة المهملات
const TARGET_VOICE_CHANNEL_ID = "1550379501714808893"; // قناة الفويس

const AUTHORIZED_ROLE_ID = "1550641497173659778";     // رول "إدارة الشركة"
const MEMBER_ROLE_ID = "1550646079475683419";         // رول "أعضاء السيرفر"

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

const TARGET_HOURS = 1000;
const TARGET_MILLISECONDS = TARGET_HOURS * 60 * 60 * 1000;
let voiceSessionStartTime = null;

// ============================================================
// 🎯 Supabase Connection
// ============================================================
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// ============================================================
// 🎯 AI Validator (مدمج)
// ============================================================

// الأسماء المصرية الشائعة
const EGYPTIAN_NAMES = {
    male: [
        'محمد', 'أحمد', 'محمود', 'مصطفى', 'عمر', 'خالد', 'يوسف', 'إبراهيم', 'عبدالله', 'حسن',
        'حسين', 'علي', 'عبدالرحمن', 'مازن', 'زياد', 'كريم', 'طارق', 'سامح', 'وائل', 'هاني',
        'ياسر', 'شريف', 'عادل', 'أيمن', 'رامي', 'مينا', 'كيرلس', 'بطرس', 'جرجس', 'شنودة',
        'ماجد', 'ميشيل', 'بيتر', 'جورج', 'فادي', 'نادر', 'سامر', 'رائد', 'مهند', 'أنس',
        'عمرو', 'سيف', 'حمزة', 'مروان', 'معاذ', 'بلال', 'أوس', 'تميم', 'يزيد', 'يعقوب',
        'إسماعيل', 'إسحاق', 'هارون', 'موسى', 'عيسى', 'نوح', 'آدم', 'شادي', 'تامر', 'وليد',
        'سيد', 'فتحي', 'عصام', 'رفعت', 'أنور', 'فؤاد', 'ناصر', 'جمال', 'كمال', 'سليم',
        'رمزي', 'نبيل', 'سامي', 'فارس', 'غسان', 'باسل', 'أمجد', 'مجد', 'رامز', 'فايز',
        'محمد أحمد', 'عبد الفتاح', 'عبد العزيز', 'عبد الحميد', 'عبد المجيد', 'عبد الكريم'
    ],
    female: [
        'فاطمة', 'عائشة', 'مريم', 'نور', 'سارة', 'ياسمين', 'دينا', 'هبة', 'إيمان', 'أمينة',
        'زينب', 'رقية', 'سلمى', 'ليلى', 'هند', 'رنا', 'ريم', 'مروة', 'نادية', 'سمية',
        'مارينا', 'مريم', 'نرمين', 'مادلين', 'كارول', 'ساندرا', 'جيسيكا', 'إيريني', 'مارينا', 'فيرينا',
        'نهى', 'مي', 'بسنت', 'حبيبة', 'جنى', 'ملك', 'لينا', 'جودي', 'رودينا', 'شهد',
        'آية', 'إسراء', 'بسمة', 'أمل', 'نجلاء', 'عبير', 'سناء', 'وفاء', 'صفاء', 'دعاء',
        'هالة', 'غادة', 'رانيا', 'شيرين', 'نيفين', 'داليا', 'هبة', 'ولاء', 'إنجي', 'سهر',
        'منى', 'هيام', 'أميرة', 'ملك', 'أسيل', 'غادة', 'رغد', 'لجين', 'دانة', 'رهف',
        'تالا', 'ميرا', 'جنى', 'روان', 'لمار', 'يارا', 'تسنيم', 'نورهان', 'روان', 'حلا'
    ]
};

// المحافظات المصرية
const EGYPT_GOVERNORATES = [
    'القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'الشرقية', 'المنوفية', 'القليوبية',
    'البحيرة', 'الغربية', 'بورسعيد', 'دمياط', 'الإسماعيلية', 'السويس', 'كفر الشيخ',
    'الفيوم', 'بني سويف', 'المنيا', 'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان',
    'البحر الأحمر', 'الوادي الجديد', 'مطروح', 'شمال سيناء', 'جنوب سيناء',
    'القاهرة الجديدة', '6 أكتوبر', 'الشيخ زايد', 'مدينة نصر', 'المعادي', 'حلوان'
];

// نطاقات الإيميل الموثوقة
const TRUSTED_EMAIL_DOMAINS = [
    'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com',
    'icloud.com', 'protonmail.com', 'mail.ru', 'yandex.com'
];

// الكلمات المحظورة
const FORBIDDEN_WORDS = [
    'asd', 'asdf', 'qwe', 'qwerty', 'test', 'testing', 'admin', 'root',
    'hgf', 'jkl', 'zxc', 'vbn', 'mnb', 'lkj', 'poiu', 'oiuy',
    'asdasd', 'asdasdasd', 'aaaa', 'bbbb', 'cccc', 'dddd', 'xxxx', 'zzzz',
    'hacker', 'hack', 'fake', 'scam', 'spam', 'null', 'undefined'
];

// ============================================================
// 🎯 AI Validator
// ============================================================
function aiValidateUser(userData) {
    let score = 100;
    let reasons = [];

    const { username, email, phone, address } = userData;

    // 1. فحص الاسم
    if (!username || typeof username !== 'string') {
        score -= 50;
        reasons.push('الاسم مفقود');
    } else {
        const parts = username.trim().split(/\s+/);
        if (parts.length < 3) {
            score -= 30;
            reasons.push('الاسم ليس ثلاثي');
        }

        let suspiciousNames = 0;
        let knownNames = 0;

        for (const part of parts) {
            if (part.length < 3) {
                score -= 15;
                suspiciousNames++;
                continue;
            }

            // فحص الحروف (عربي أو إنجليزي فقط)
            if (!/^[\u0600-\u06FFa-zA-Z]+$/.test(part)) {
                score -= 20;
                reasons.push(`الاسم "${part}" يحتوي على رموز أو أرقام`);
                continue;
            }

            // فحص الكلمات المحظورة
            const lowerPart = part.toLowerCase();
            if (FORBIDDEN_WORDS.some(w => lowerPart.includes(w))) {
                score -= 40;
                reasons.push(`الاسم "${part}" فيه كلمة محظورة`);
                continue;
            }

            // فحص إن الاسم في قاعدة الأسامي المصرية
            const allNames = [...EGYPTIAN_NAMES.male, ...EGYPTIAN_NAMES.female];
            if (allNames.some(n => n.includes(part) || part.includes(n))) {
                knownNames++;
            }
        }

        if (knownNames === 0 && parts.length >= 3) {
            score -= 25;
            reasons.push('الاسم غير معروف في الأسامي المصرية الشائعة');
        }
    }

    // 2. فحص الإيميل
    if (!email || typeof email !== 'string') {
        score -= 20;
        reasons.push('الإيميل مفقود');
    } else {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            score -= 30;
            reasons.push('صيغة الإيميل غير صحيحة');
        } else {
            const domain = email.split('@')[1].toLowerCase();
            if (!TRUSTED_EMAIL_DOMAINS.includes(domain)) {
                score -= 20;
                reasons.push(`نطاق الإيميل "${domain}" غير موثوق`);
            }

            const emailUser = email.split('@')[0].toLowerCase();
            if (FORBIDDEN_WORDS.some(w => emailUser.includes(w))) {
                score -= 30;
                reasons.push('الإيميل فيه كلمات محظورة');
            }
        }
    }

    // 3. فحص الموبايل
    if (!phone || typeof phone !== 'string') {
        score -= 20;
        reasons.push('الموبايل مفقود');
    } else {
        const cleaned = phone.replace(/\D/g, '').replace(/^20/, '');
        if (!/^01[0125]\d{8}$/.test(cleaned)) {
            score -= 40;
            reasons.push('رقم الموبايل غير مصري أو غير صحيح');
        }
        if (/^(\d)\1{7,}$/.test(cleaned)) {
            score -= 40;
            reasons.push('رقم الموبايل فيه تكرار غريب');
        }
    }

    // 4. فحص المحافظة
    if (!address || typeof address !== 'string') {
        score -= 15;
        reasons.push('المحافظة مفقودة');
    } else {
        const cleanAddress = address.trim();
        if (!EGYPT_GOVERNORATES.some(g => cleanAddress.includes(g) || g.includes(cleanAddress))) {
            score -= 20;
            reasons.push('المحافظة غير معروفة');
        }
    }

    // القرار النهائي
    const verdict = score >= 60 ? 'approved' : 'suspicious';
    const finalScore = Math.max(0, score);

    return {
        score: finalScore,
        verdict,
        reason: reasons.length > 0 ? reasons.join(' | ') : 'البيانات تبدو صحيحة'
    };
}

// ============================================================
// 🎯 Discord Client
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

let currentConnection = null;

// ============================================================
// 🎯 Express Server
// ============================================================
const app = express();
app.use(express.json());

app.get("/", (req, res) => {
    const uptimeHours = voiceSessionStartTime ? ((Date.now() - voiceSessionStartTime) / (1000 * 60 * 60)).toFixed(2) : 0;
    res.send(`HERTZ ADMIN BOT is running 24/7. | Voice Active Hours: ${uptimeHours} / ${TARGET_HOURS}h`);
});

// ============================================================
// 📥 API: تسجيل مستخدم جديد
// ============================================================
app.post("/register", async (req, res) => {
    try {
        const receivedSecret = req.headers["x-hertz-secret"];
        if (receivedSecret !== WEBHOOK_SECRET) {
            console.log("❌ Unauthorized register request.");
            return res.status(401).json({ error: "Unauthorized" });
        }

        const { username, email, phone, address, user_code, sequence_number, ip, password } = req.body;

        if (!username || !phone) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        console.log(`📥 تسجيل جديد: ${username} | ${phone}`);

        // 🎯 تشغيل AI Validator
        const validation = aiValidateUser({ username, email, phone, address });
        console.log(`🤖 AI Score: ${validation.score} | Verdict: ${validation.verdict}`);

        // 🎯 حفظ في pending_users
        const { data: pendingData, error: pendingError } = await supabase
            .from('pending_users')
            .insert([{
                username,
                email,
                phone,
                address,
                user_code,
                sequence_number,
                ip,
                password,
                status: 'waiting',
                ai_score: validation.score,
                ai_verdict: validation.verdict,
                ai_reason: validation.reason,
                ai_checked: false,
                decision_deadline: new Date(Date.now() + 5 * 60 * 1000).toISOString()
            }])
            .select()
            .single();

        if (pendingError) {
            console.error("❌ Supabase insert error:", pendingError);
            return res.status(500).json({ error: "Database error" });
        }

        // 🎯 إرسال رسالة في Discord
        const channel = await client.channels.fetch(VISIT_CHANNEL_ID).catch(() => null);
        if (!channel) {
            console.error("❌ Channel not found");
            return res.status(500).json({ error: "Channel not found" });
        }

        const messageContent =
            `👤 **مستخدم جديد قام بإنشاء حساب في المتجر**\n\n` +
            `🔢 **الرقم التسلسلي:**\n\`المستخدم رقم ${sequence_number}\`\n\n` +
            `🔑 **كود الشخص:**\n\`${user_code}\`\n\n` +
            `📌 **الاسم الثلاثي:**\n\`\`\`${username}\`\`\`\n` +
            `📧 **البريد الإلكتروني:**\n\`\`\`${email}\`\`\`\n` +
            `📱 **رقم الهاتف:**\n\`\`\`+20 ${phone}\`\`\`\n` +
            `📍 **المحافظة:**\n\`\`\`${address}\`\`\`\n` +
            `🔑 **كلمة المرور:**\n\`\`\`${password}\`\`\`\n` +
            `🌐 **عنوان الـ IP:**\n\`\`\`${ip}\`\`\``;

        const sentMessage = await channel.send({ content: messageContent });
        console.log(`✅ تم إرسال الرسالة: ${sentMessage.id}`);

        // 🎯 ربط الرسالة بـ pending_user
        await supabase
            .from('pending_users')
            .update({ discord_message_id: sentMessage.id })
            .eq('id', pendingData.id);

        // 🎯 جدولة AI Validation بعد 5 دقايق
        scheduleAiCheck(pendingData.id, sentMessage.id, 5 * 60 * 1000);

        res.status(200).json({
            success: true,
            user_id: pendingData.id,
            status: 'waiting',
            message: 'تم التسجيل، في انتظار المراجعة'
        });

    } catch (error) {
        console.error("❌ Register error:", error);
        res.status(500).json({ error: "Server error" });
    }
});

// ============================================================
// 🔍 API: فحص الحظر
// ============================================================
app.get("/check-ban", async (req, res) => {
    try {
        const { phone, user_code } = req.query;

        if (!phone && !user_code) {
            return res.status(400).json({ error: "Missing phone or user_code" });
        }

        let query = supabase.from('bans').select('*').eq('is_active', true);
        if (phone) query = query.eq('phone', phone);
        else if (user_code) query = query.eq('user_code', user_code);

        const { data, error } = await query;

        if (error) {
            console.error("❌ Check-ban error:", error);
            return res.status(500).json({ error: "Database error" });
        }

        res.status(200).json({
            banned: data && data.length > 0,
            ban_info: data && data.length > 0 ? data[0] : null
        });

    } catch (error) {
        console.error("❌ Check-ban error:", error);
        res.status(500).json({ error: "Server error" });
    }
});

// ============================================================
// 🚫 API: حظر مستخدم
// ============================================================
app.post("/ban", async (req, res) => {
    try {
        const receivedSecret = req.headers["x-hertz-secret"];
        if (receivedSecret !== WEBHOOK_SECRET) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const { phone, user_code, username, reason, banned_by } = req.body;

        const { data, error } = await supabase
            .from('bans')
            .insert([{
                phone,
                user_code,
                username,
                reason: reason || 'بدون سبب',
                banned_by: banned_by || 'AI System',
                is_active: true
            }])
            .select()
            .single();

        if (error) {
            console.error("❌ Ban error:", error);
            return res.status(500).json({ error: "Database error" });
        }

        console.log(`🚫 تم حظر: ${username} (${phone})`);
        res.status(200).json({ success: true, ban: data });

    } catch (error) {
        console.error("❌ Ban error:", error);
        res.status(500).json({ error: "Server error" });
    }
});

// ============================================================
// ✅ API: فك الحظر
// ============================================================
app.post("/unban", async (req, res) => {
    try {
        const receivedSecret = req.headers["x-hertz-secret"];
        if (receivedSecret !== WEBHOOK_SECRET) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const { phone, user_code } = req.body;

        let query = supabase.from('bans').update({ is_active: false });
        if (phone) query = query.eq('phone', phone);
        else if (user_code) query = query.eq('user_code', user_code);

        const { error } = await query;

        if (error) {
            console.error("❌ Unban error:", error);
            return res.status(500).json({ error: "Database error" });
        }

        console.log(`✅ تم فك الحظر: ${phone || user_code}`);
        res.status(200).json({ success: true });

    } catch (error) {
        console.error("❌ Unban error:", error);
        res.status(500).json({ error: "Server error" });
    }
});

// ============================================================
// 📊 API: كل المستخدمين (للداشبورد)
// ============================================================
app.get("/users", async (req, res) => {
    try {
        const receivedSecret = req.headers["x-hertz-secret"];
        if (receivedSecret !== WEBHOOK_SECRET) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: "Database error" });
        res.status(200).json({ users: data });

    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});

// ============================================================
// 📊 API: كل المحظورين
// ============================================================
app.get("/bans", async (req, res) => {
    try {
        const receivedSecret = req.headers["x-hertz-secret"];
        if (receivedSecret !== WEBHOOK_SECRET) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const { data, error } = await supabase
            .from('bans')
            .select('*')
            .eq('is_active', true)
            .order('banned_at', { ascending: false });

        if (error) return res.status(500).json({ error: "Database error" });
        res.status(200).json({ bans: data });

    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});

// ============================================================
// 🔄 دالة جدولة AI Check بعد 5 دقايق
// ============================================================
function scheduleAiCheck(pendingUserId, messageId, delayMs) {
    console.log(`⏳ جدولة AI Check لـ ${pendingUserId} بعد ${delayMs / 1000} ثانية`);

    setTimeout(async () => {
        try {
            console.log(`🤖 بدء AI Check لـ ${pendingUserId}`);

            // 1. نجيب بيانات المستخدم من pending_users
            const { data: user, error } = await supabase
                .from('pending_users')
                .select('*')
                .eq('id', pendingUserId)
                .single();

            if (error || !user) {
                console.error("❌ User not found:", error);
                return;
            }

            // 2. لو الإدارة ردت، مانعملش حاجة
            if (user.status !== 'waiting') {
                console.log(`✅ الإدارة ردت بالفعل — status: ${user.status}`);
                return;
            }

            // 3. تشغيل AI Validator
            const validation = aiValidateUser({
                username: user.username,
                email: user.email,
                phone: user.phone,
                address: user.address
            });

            console.log(`🤖 AI Verdict: ${validation.verdict} | Score: ${validation.score}`);

            // 4. تحديث pending_users
            await supabase
                .from('pending_users')
                .update({
                    ai_checked: true,
                    ai_verdict: validation.verdict,
                    ai_reason: validation.reason,
                    ai_score: validation.score,
                    decision_made_by: 'AI',
                    status: 'approved'
                })
                .eq('id', pendingUserId);

            // 5. نقل إلى users
            const { error: insertError } = await supabase
                .from('users')
                .insert([{
                    username: user.username,
                    email: user.email,
                    phone: user.phone,
                    address: user.address,
                    user_code: user.user_code,
                    sequence_number: user.sequence_number,
                    ip: user.ip,
                    status: 'approved',
                    ai_score: validation.score,
                    ai_verdict: validation.verdict,
                    ai_reason: validation.reason
                }]);

            if (insertError) console.error("❌ Insert users error:", insertError);

            // 6. تعديل الرسالة في Discord
            try {
                const channel = await client.channels.fetch(VISIT_CHANNEL_ID);
                const message = await channel.messages.fetch(messageId);

                const isSuspicious = validation.verdict === 'suspicious';
                const header = isSuspicious
                    ? `⚠️ **AI: البيانات مشكوك فيها**\n🔴 **السبب:** ${validation.reason}\n\n⬇️ **البيانات الأصلية:**\n\n`
                    : `✅ **AI: البيانات صحيحة** (Score: ${validation.score}/100)\n\n⬇️ **البيانات الأصلية:**\n\n`;

                await message.edit({ content: header + message.content });
                console.log(`✅ تم تعديل الرسالة (${validation.verdict})`);

            } catch (msgErr) {
                console.error("❌ خطأ في تعديل الرسالة:", msgErr.message);
            }

        } catch (err) {
            console.error("❌ AI Check error:", err);
        }
    }, delayMs);
}

// ============================================================
// 🎯 نظام الريأكتات (مع Supabase)
// ============================================================
function isAuthorizedFast(message, userId) {
    try {
        let member = message.guild.members.cache.get(userId);
        if (!member) {
            message.guild.members.fetch(userId).catch(() => {});
            return false;
        }
        return member.roles.cache.has(AUTHORIZED_ROLE_ID);
    } catch (err) {
        return false;
    }
}

client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;

    const message = reaction.message;
    if (!message.guild) return;

    const isTargetChannel =
        message.channelId === VISIT_CHANNEL_ID ||
        message.channelId === OLD_DATA_CHANNEL_ID ||
        message.channelId === TRASH_CHANNEL_ID;

    if (!isTargetChannel) return;

    // 🛡️ التحقق من الرول
    const authorized = isAuthorizedFast(message, user.id);

    if (!authorized) {
        console.log(`⚠️ [مرفوض]: ${user.tag}`);
        try { await reaction.users.remove(user.id); } catch (err) {}
        return;
    }

    if (reaction.partial) {
        try { await reaction.fetch(); } catch (error) { return; }
    }
    if (reaction.message.partial) {
        try { await reaction.message.fetch(); } catch (error) { return; }
    }

    const emoji = reaction.emoji.name;
    const msgContent = message.content || "";
    const msgEmbeds = message.embeds;

    // ✅ الموافقة
    if (emoji === '✅') {
        if (message.channelId === VISIT_CHANNEL_ID) {
            // لو دي رسالة مستخدم (من pending_users)
            await handleApproval(message, user);

            try { await message.delete(); } catch (error) { return; }
            const oldChannel = await client.channels.fetch(OLD_DATA_CHANNEL_ID).catch(() => null);
            if (oldChannel) {
                await oldChannel.send({ content: msgContent, embeds: msgEmbeds });
            }
            console.log("✅ [DATA-NEW] → [DATA-OLD]");
        }
        else if (message.channelId === OLD_DATA_CHANNEL_ID) {
            try { await reaction.users.remove(user.id); } catch (error) {}
            return;
        }
        else if (message.channelId === TRASH_CHANNEL_ID) {
            try { await message.delete(); } catch (error) { return; }
            const oldChannel = await client.channels.fetch(OLD_DATA_CHANNEL_ID).catch(() => null);
            if (oldChannel) {
                await oldChannel.send({ content: msgContent, embeds: msgEmbeds });
            }
            console.log("✅ [TRASH] → [DATA-OLD]");
        }
    }
    // ❌ الرفض
    else if (emoji === '❌') {
        if (message.channelId === VISIT_CHANNEL_ID || message.channelId === OLD_DATA_CHANNEL_ID) {
            // لو دي رسالة مستخدم (من pending_users)
            if (message.channelId === VISIT_CHANNEL_ID) {
                await handleRejection(message, user);
            }

            try { await message.delete(); } catch (error) { return; }
            const trashChannel = await client.channels.fetch(TRASH_CHANNEL_ID).catch(() => null);
            if (trashChannel) {
                await trashChannel.send({ content: msgContent, embeds: msgEmbeds });
            }
            console.log("❌ → [TRASH]");
        }
        else if (message.channelId === TRASH_CHANNEL_ID) {
            try { await reaction.users.remove(user.id); } catch (err) {}
            console.log("❌ [TRASH] → تم إزالة الريأكت");
            return;
        }
    }
});

// ============================================================
// ✅ الموافقة على مستخدم
// ============================================================
async function handleApproval(message, adminUser) {
    try {
        const { data: pending, error } = await supabase
            .from('pending_users')
            .select('*')
            .eq('discord_message_id', message.id)
            .single();

        if (error || !pending) {
            console.log("⚠️ No pending user found for this message");
            return;
        }

        // تحديث pending_users
        await supabase
            .from('pending_users')
            .update({
                status: 'approved',
                decision_made_by: adminUser.tag
            })
            .eq('id', pending.id);

        // نقل إلى users
        await supabase
            .from('users')
            .insert([{
                username: pending.username,
                email: pending.email,
                phone: pending.phone,
                address: pending.address,
                user_code: pending.user_code,
                sequence_number: pending.sequence_number,
                ip: pending.ip,
                status: 'approved'
            }]);

        console.log(`✅ تم قبول: ${pending.username} بواسطة ${adminUser.tag}`);

    } catch (err) {
        console.error("❌ handleApproval error:", err);
    }
}

// ============================================================
// ❌ رفض مستخدم (حظر)
// ============================================================
async function handleRejection(message, adminUser) {
    try {
        const { data: pending, error } = await supabase
            .from('pending_users')
            .select('*')
            .eq('discord_message_id', message.id)
            .single();

        if (error || !pending) {
            console.log("⚠️ No pending user found for this message");
            return;
        }

        // تحديث pending_users
        await supabase
            .from('pending_users')
            .update({
                status: 'banned',
                decision_made_by: adminUser.tag
            })
            .eq('id', pending.id);

        // إضافة إلى bans
        await supabase
            .from('bans')
            .insert([{
                phone: pending.phone,
                user_code: pending.user_code,
                username: pending.username,
                reason: `رفض من الإدارة: ${adminUser.tag}`,
                banned_by: adminUser.tag,
                is_active: true
            }]);

        console.log(`❌ تم حظر: ${pending.username} بواسطة ${adminUser.tag}`);

    } catch (err) {
        console.error("❌ handleRejection error:", err);
    }
}

// ============================================================
// 🔊 دخول الفويس
// ============================================================
async function connectToVoiceChannel() {
    try {
        const channel = await client.channels.fetch(TARGET_VOICE_CHANNEL_ID);
        if (!channel || channel.type !== 2) {
            console.log("❌ القناة الصوتية المطلوبة غير موجودة.");
            return;
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
            if (!voiceSessionStartTime) {
                voiceSessionStartTime = Date.now();
            }
            console.log(`🔊 [استقرار دائم]: البوت دخل الفويس: ${channel.name}`);
        });

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await entersState(connection, VoiceConnectionStatus.Signalling, 1_000);
            } catch (error) {
                try { connection.destroy(); } catch (e) {}
                console.log("🔄 إعادة دخول الفويس...");
                setTimeout(connectToVoiceChannel, 200);
            }
        });

        connection.on('error', (error) => {
            try { connection.destroy(); } catch (e) {}
            setTimeout(connectToVoiceChannel, 200);
        });
    } catch (error) {
        console.error("❌ خطأ في دخول الفويس:", error);
        setTimeout(connectToVoiceChannel, 1000);
    }
}

// ============================================================
// 🚀 عند جاهزية البوت
// ============================================================
client.once("ready", async () => {
    console.log(`✅ البوت اشتغل بنجاح: ${client.user.tag}`);
    console.log(`🌐 Webhook server running on port ${PORT}`);

    try {
        for (const [guildId, guild] of client.guilds.cache) {
            console.log(`🔄 جلب أعضاء: ${guild.name}`);
            await guild.members.fetch();
            console.log(`✅ تم جلب ${guild.memberCount} عضو`);
        }
    } catch (err) {
        console.error("❌ خطأ في جلب الأعضاء:", err);
    }

    connectToVoiceChannel();

    setInterval(async () => {
        try {
            if (!currentConnection || currentConnection.state.status === VoiceConnectionStatus.Disconnected || currentConnection.state.status === VoiceConnectionStatus.Destroyed) {
                console.log("⚠️ إعادة إدخال البوت للفويس...");
                connectToVoiceChannel();
            }
        } catch (e) {
            connectToVoiceChannel();
        }
    }, 10 * 1000);
});

process.on('unhandledRejection', (error) => {
    console.error('⚠️ Unhandled Rejection:', error);
});
process.on('uncaughtException', (error) => {
    console.error('⚠️ Uncaught Exception:', error);
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Webhook server running on port ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN)
    .catch((error) => {
        console.error("❌ فشل تسجيل الدخول:", error);
    });

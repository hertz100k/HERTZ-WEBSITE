// ============================================================
// ✅ دالة نشر القوانين
// ============================================================
async function deployRules(guild, silent = false) {
    const everyoneRole = guild.roles.everyone;

    try {
        const generalChannel = await guild.channels.fetch(GENERAL_RULES_CHANNEL_ID).catch(() => null);
        if (!generalChannel) {
            console.error(`❌ [RULES] روم القوانين العامة مش موجود!`);
            return { success: false, message: 'روم القوانين العامة مش موجود، تأكد من الآي دي!' };
        }

        const botMember = guild.members.me;
        const perms = generalChannel.permissionsFor(botMember);
        if (!perms || !perms.has(PermissionFlagsBits.SendMessages)) {
            console.error(`❌ [RULES] البوت مش عنده صلاحية إرسال في روم القوانين العامة!`);
            return { success: false, message: 'البوت مش عنده صلاحية إرسال في روم القوانين العامة!' };
        }

        const generalEmbed = new EmbedBuilder()
            .setColor(0x2b2d31)
            .setTitle('📜 مرحباً بكم في قوانين سيرفرنا')
            .setDescription(GENERAL_RULES_TEXT)
            .setImage(RULES_IMAGE_URL)
            .setFooter({ 
                text: `${SERVER_NAME} • القوانين العامة`,
                iconURL: guild.iconURL({ dynamic: true }) || undefined
            })
            .setTimestamp();

        await generalChannel.send({
            content: `${everyoneRole} **يرجى قراءة القوانين بعناية**`,
            embeds: [generalEmbed]
        });

        if (!silent) console.log(`✅ [RULES] تم نشر القوانين العامة في #${generalChannel.name}`);
    } catch (err) {
        console.error(`❌ [RULES] خطأ في نشر القوانين العامة:`, err.message);
        return { success: false, message: 'خطأ في نشر القوانين العامة!' };
    }

    try {
        const adminChannel = await guild.channels.fetch(ADMIN_RULES_CHANNEL_ID).catch(() => null);
        if (!adminChannel) {
            console.error(`❌ [RULES] روم قوانين الإدارة مش موجود!`);
            return { success: false, message: 'روم قوانين الإدارة مش موجود، تأكد من الآي دي!' };
        }

        const botMember = guild.members.me;
        const perms = adminChannel.permissionsFor(botMember);
        if (!perms || !perms.has(PermissionFlagsBits.SendMessages)) {
            console.error(`❌ [RULES] البوت مش عنده صلاحية إرسال في روم قوانين الإدارة!`);
            return { success: false, message: 'البوت مش عنده صلاحية إرسال في روم قوانين الإدارة!' };
        }

        const adminEmbed = new EmbedBuilder()
            .setColor(0x2b2d31)
            .setTitle('📜 مرحباً بكم في قوانين الإدارة')
            .setDescription(ADMIN_RULES_TEXT)
            .setImage(ADMIN_RULES_IMAGE_URL)
            .setFooter({ 
                text: `${SERVER_NAME} • قوانين الإدارة`,
                iconURL: guild.iconURL({ dynamic: true }) || undefined
            })
            .setTimestamp();

        await adminChannel.send({
            content: `${everyoneRole} **يرجى قراءة قوانين الإدارة بعناية**`,
            embeds: [adminEmbed]
        });

        if (!silent) console.log(`✅ [RULES] تم نشر قوانين الإدارة في #${adminChannel.name}`);
    } catch (err) {
        console.error(`❌ [RULES] خطأ في نشر قوانين الإدارة:`, err.message);
        return { success: false, message: 'خطأ في نشر قوانين الإدارة!' };
    }

    return { success: true, message: '✅ تم نشر القوانين العامة وقوانين الإدارة بنجاح!' };
}

// ============================================================
// دالة الترحيب
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
            .setDescription(`أهلاً بك يا ${memberMention} في سيرفر **${SERVER_NAME}**`)
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
// دالة المغادرة
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
        await leaveChannel.send({ content: `**غادر** ${memberMention}` });

        console.log(`✅ [LEAVE SUCCESS] تم تسجيل مغادرة ${memberTag}\n`);
    } catch (error) {
        console.error(`❌ [LEAVE ERROR]:`, error);
        leftMembers.delete(memberId);
    } finally {
        leaveProcessing.delete(memberId);
    }
}

// ============================================================
// أحداث الانضمام والمغادرة
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
// Polling
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
// ✅ نظام الحماية (روابط + سبام)
// ============================================================
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const isAdmin = await isAuthorizedFast(message.guild, message.author.id);
    if (isAdmin) return;

    const userId = message.author.id;
    const currentTime = Date.now();

    // 1. حماية الروابط
    const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9][-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*))/gi;

    if (linkRegex.test(message.content)) {
        try {
            await message.delete().catch(() => {});

            let userRecord = linkSpamMap.get(userId) || { count: 0, lastTime: currentTime };

            if (currentTime - userRecord.lastTime < LINK_SPAM_WINDOW) {
                userRecord.count += 1;
            } else {
                userRecord.count = 1;
            }
            userRecord.lastTime = currentTime;
            linkSpamMap.set(userId, userRecord);

            console.log(`🔗 [LINK] ${message.author.tag} بعت لينك (تكرار: ${userRecord.count})`);

            if (userRecord.count >= LINK_SPAM_THRESHOLD) {
                try {
                    const member = await message.guild.members.fetch(userId);
                    await member.timeout(LINK_TIMEOUT_DURATION, 'إرسال روابط متكررة');
                    linkSpamMap.delete(userId);

                    const warningMsg = await message.channel.send(
                        `⚠️ ${message.author} تم إعطاؤك **تايم أوت لمدة ساعة** بسبب إرسال الروابط المتكررة.`
                    );
                    setTimeout(() => warningMsg.delete().catch(() => {}), LINK_WARNING_DURATION);
                    console.log(`⏱️ [LINK TIMEOUT] ${message.author.tag}`);
                    return;
                } catch (err) {
                    console.error('❌ فشل التايم أوت:', err.message);
                }
            }

            const firstWarning = await message.channel.send(
                `⚠️ ${message.author} ممنوع نشر الروابط في السيرفر! التكرار سيؤدي إلى تايم أوت.`
            );
            setTimeout(() => firstWarning.delete().catch(() => {}), LINK_WARNING_DURATION);
            return;
        } catch (error) {
            console.error('❌ خطأ حذف الرابط:', error.message);
        }
    }

    // 2. مكافحة السبام النصي
    try {
        let textRecord = textSpamMap.get(userId) || { timestamps: [] };

        textRecord.timestamps = textRecord.timestamps.filter(
            ts => currentTime - ts < TEXT_SPAM_WINDOW
        );

        textRecord.timestamps.push(currentTime);
        textSpamMap.set(userId, textRecord);

        if (textRecord.timestamps.length >= TEXT_SPAM_THRESHOLD) {
            try {
                const member = await message.guild.members.fetch(userId);
                await member.timeout(TEXT_SPAM_TIMEOUT, 'إرسال رسائل سبام');
                textSpamMap.delete(userId);

                const warningMsg = await message.channel.send(
                    `⚠️ ${message.author} تم إعطاؤك **تايم أوت لمدة 10 دقائق** بسبب السبام.`
                );
                setTimeout(() => warningMsg.delete().catch(() => {}), LINK_WARNING_DURATION);
                console.log(`⏱️ [TEXT SPAM] ${message.author.tag}`);
                return;
            } catch (err) {
                console.error('❌ فشل التايم أوت:', err.message);
            }
        }
    } catch (error) {
        console.error('❌ خطأ السبام:', error.message);
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
        if (message.channelId === SUPPORT_CHANNEL_ID) targetVaultId = TRASH_SUPPORT_CHANNEL_ID;
        else if (message.channelId === ORDER_CHANNEL_ID) targetVaultId = TRASH_ORDER_CHANNEL_ID;
        else if (message.channelId === CANCEL_CHANNEL_ID) targetVaultId = TRASH_CANCEL_CHANNEL_ID;

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
// الفويس
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
// Ready
// ============================================================
client.once("ready", async () => {
    console.log(`\n============================================`);
    console.log(`✅ HERTZ ADMIN BOT is online: ${client.user.tag}`);
    console.log(`📋 GUILD ID: ${GUILD_ID}`);
    console.log(`============================================\n`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        const commands = [
            new SlashCommandBuilder()
                .setName('clear')
                .setDescription('حذف عدد معين من الرسائل (خاص بالإدارة)')
                .addIntegerOption(option =>
                    option.setName('count')
                        .setDescription('عدد الرسائل (1-100)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(100)
                ),
            new SlashCommandBuilder()
                .setName('sendrules')
                .setDescription('نشر القوانين (خاص بالإدارة)')
        ].map(command => command.toJSON());

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('✅ تم تسجيل الأوامر بنجاح!');
    } catch (error) {
        console.error('❌ خطأ تسجيل الأوامر:', error);
    }

    setTimeout(async () => {
        try {
            const guild = client.guilds.cache.get(GUILD_ID) || client.guilds.cache.first();
            if (guild) {
                console.log('\n📜 [RULES] جاري نشر القوانين...');
                const result = await deployRules(guild, false);
                if (result.success) {
                    console.log('✅ [RULES] تم النشر بنجاح!');
                } else {
                    console.error(`❌ [RULES] ${result.message}`);
                }
            }
        } catch (err) {
            console.error('❌ [RULES] خطأ:', err.message);
        }
    }, 3000);

    connectToVoiceChannel();

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
// أوامر السلاش
// ============================================================
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'clear') {
        const userId = interaction.user.id;

        if (clearProcessing.has(userId)) {
            await interaction.reply({ content: '⏳ في عملية مسح جارية.', ephemeral: true });
            return;
        }

        clearProcessing.add(userId);

        try {
            const authorized = await isAuthorizedFast(interaction.guild, userId);
            if (!authorized) {
                await interaction.reply({ content: '❌ مخصص للإدارة فقط!', ephemeral: true });
                clearProcessing.delete(userId);
                return;
            }

            const count = interaction.options.getInteger('count');
            await interaction.deferReply({ ephemeral: true });
            const deleted = await interaction.channel.bulkDelete(count, true);
            await interaction.editReply({ content: `✅ تم حذف **${deleted.size}** رسالة.` });
        } catch (error) {
            console.error('❌ خطأ المسح:', error);
            try {
                await interaction.editReply({ content: '❌ حدث خطأ.' });
            } catch (e) {}
        } finally {
            clearProcessing.delete(userId);
        }
    }

    if (interaction.commandName === 'sendrules') {
        const userId = interaction.user.id;

        if (rulesProcessing.has(userId)) {
            await interaction.reply({ content: '⏳ في عملية نشر جارية.', ephemeral: true });
            return;
        }

        rulesProcessing.add(userId);

        try {
            const authorized = await isAuthorizedFast(interaction.guild, userId);
            if (!authorized) {
                await interaction.reply({ content: '❌ مخصص للإدارة فقط!', ephemeral: true });
                rulesProcessing.delete(userId);
                return;
            }

            await interaction.deferReply({ ephemeral: true });
            const result = await deployRules(interaction.guild, true);
            await interaction.editReply({ content: result.message });
        } catch (error) {
            console.error('❌ خطأ النشر:', error);
            try {
                await interaction.editReply({ content: '❌ حدث خطأ.' });
            } catch (e) {}
        } finally {
            rulesProcessing.delete(userId);
        }
    }
});

// ============================================================
// حماية من الأخطاء
// ============================================================
process.on('unhandledRejection', (reason) => {
    console.error('⚠️ [UNHANDLED]', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
    console.error('⚠️ [UNCAUGHT]', err?.message || err);
});

// ============================================================
// Express
// ============================================================
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Server Port ${PORT}`);
});

// ============================================================
// تسجيل الدخول
// ============================================================
client.login(process.env.DISCORD_TOKEN).catch((err) => {
    console.error('❌ [LOGIN] فشل:', err.message);
});

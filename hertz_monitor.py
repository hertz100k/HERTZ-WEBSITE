import os
from dotenv import load_dotenv
load_dotenv()

import discord
import requests
import time
import sqlite3
import threading
import hashlib
from datetime import datetime, timezone

# ============================================================
# الإعدادات (سحب التوكنات بأمان من ملف الـ .env أو نظام التشغيل)
# ============================================================
DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

DB_PATH = "hertz_dedup.db"
DEDUP_WINDOW = 86400  # حظر كامل لأي تكرار لنفس الحدث خلال 24 ساعة

# قفل عام لمنع التكرار عند وصول الأحداث في نفس اللحظة (Race Condition)
_db_lock = threading.Lock()
_send_lock = threading.Lock()

# ============================================================
# قاعدة بيانات منع التكرار الصارمة (Atomic Dedup Engine)
# ============================================================
def init_db():
    conn = sqlite3.connect(DB_PATH, timeout=20, isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS processed (
            key TEXT PRIMARY KEY,
            ts REAL NOT NULL
        )
    """)
    conn.commit()
    conn.close()

def cleanup_old():
    try:
        conn = sqlite3.connect(DB_PATH, timeout=20)
        conn.execute("DELETE FROM processed WHERE ts < ?", (time.time() - DEDUP_WINDOW,))
        conn.commit()
        conn.close()
    except Exception:
        pass

def is_duplicate(key):
    """
    ترجع True لو الرسالة مكررة (اترسلت قبل كده خلال 24 ساعة)
    ترجع False لو جديدة (وتم تسجيلها فوراً لمنع تكرارها)
    العملية ذرية (Atomic) باستخدام INSERT OR IGNORE + قفل
    """
    if not key:
        return True  # مفتاح فاضي = مرفوض
    with _db_lock:
        try:
            conn = sqlite3.connect(DB_PATH, timeout=20, isolation_level=None)
            cursor = conn.execute(
                "INSERT OR IGNORE INTO processed (key, ts) VALUES (?, ?)",
                (key, time.time())
            )
            inserted = cursor.rowcount  # 1 = تم الإدخال (جديد) / 0 = موجود مسبقاً (مكرر)
            conn.close()
            return inserted == 0
        except Exception as e:
            print(f"DB Error: {e}")
            # في حالة الخطأ نرفض الإرسال لضمان عدم التكرار
            return True

init_db()

def send_telegram(text, event_key):
    # منع التكرار أولاً (قبل أي إرسال)
    if is_duplicate(event_key):
        return

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": text,
        "parse_mode": "Markdown"
    }
    with _send_lock:
        try:
            requests.post(url, json=payload, timeout=10)
        except Exception as e:
            print(f"Telegram Error: {e}")

# ============================================================
# Discord Client
# ============================================================
intents = discord.Intents.default()
intents.members = True
intents.message_content = True
intents.voice_states = True
intents.guilds = True
intents.moderation = True

client = discord.Client(intents=intents)

@client.event
async def on_ready():
    print(f'✅ البوت يعمل بأقصى تردد وبدون أي تكرار نهائياً لإدارة محمد حبيب: {client.user}')
    cleanup_old()

# ============================================================
# 1) دخول عضو للسيرفر
# ============================================================
@client.event
async def on_member_join(member):
    now = datetime.now().strftime('%I:%M:%S %p')
    key = f"join:{member.guild.id}:{member.id}"
    msg = (
        f"🟢 *عضو جديد دخل السيرفر!*\n"
        f"- الاسم: `{member.name}`\n"
        f"- الآي دي: `{member.id}`\n"
        f"- الوقت: `{now}`"
    )
    send_telegram(msg, key)

# ============================================================
# 2) خروج عضو (مغادرة أو طرد Kick)
# ============================================================
@client.event
async def on_member_remove(member):
    now = datetime.now().strftime('%I:%M:%S %p')

    actor = "مغادرة طبيعية (بدون طرد)"
    try:
        async for entry in member.guild.audit_logs(limit=3, action=discord.AuditLogAction.kick):
            if entry.target and entry.target.id == member.id:
                if (datetime.now(timezone.utc) - entry.created_at).total_seconds() < 15:
                    actor = entry.user.name
                    break
    except Exception:
        pass

    if actor != "مغادرة طبيعية (بدون طرد)":
        key = f"kick:{member.guild.id}:{member.id}"
        msg = (
            f"👢 *تم طرد عضو (Kick)!*\n"
            f"- بواسطة المسؤول: `{actor}`\n"
            f"- العضو المطرود: `{member.name}`\n"
            f"- الآي دي: `{member.id}`\n"
            f"- الوقت: `{now}`"
        )
    else:
        key = f"leave:{member.guild.id}:{member.id}"
        msg = (
            f"🔴 *عضو غادر السيرفر!*\n"
            f"- الاسم: `{member.name}`\n"
            f"- الآي دي: `{member.id}`\n"
            f"- الوقت: `{now}`"
        )

    send_telegram(msg, key)

# ============================================================
# 3) الحظر (Ban)
# ============================================================
@client.event
async def on_member_ban(guild, user):
    now = datetime.now().strftime('%I:%M:%S %p')

    actor = "مسؤول غير معروف"
    try:
        async for entry in guild.audit_logs(limit=3, action=discord.AuditLogAction.ban):
            if entry.target and entry.target.id == user.id:
                if (datetime.now(timezone.utc) - entry.created_at).total_seconds() < 15:
                    actor = entry.user.name
                    break
    except Exception:
        pass

    key = f"ban:{guild.id}:{user.id}"
    msg = (
        f"🔨 *تم حظر عضو (Ban)!*\n"
        f"- بواسطة المسؤول: `{actor}`\n"
        f"- العضو المحظور: `{user.name}`\n"
        f"- الآي دي: `{user.id}`\n"
        f"- الوقت: `{now}`"
    )
    send_telegram(msg, key)

# ============================================================
# 4) فتح وتفعيل التذاكر (Tickets Create & Close)
# ============================================================
@client.event
async def on_guild_channel_create(channel):
    now = datetime.now().strftime('%I:%M:%S %p')
    channel_name_lower = channel.name.lower()
    is_ticket = "ticket" in channel_name_lower or "تكت" in channel_name_lower

    creator_name = "مسؤول أو بوت غير معروف"
    try:
        async for entry in channel.guild.audit_logs(limit=3, action=discord.AuditLogAction.channel_create):
            if entry.target and entry.target.id == channel.id:
                if (datetime.now(timezone.utc) - entry.created_at).total_seconds() < 10:
                    creator_name = entry.user.name
                    break
    except Exception:
        pass

    if is_ticket:
        key = f"ticket_create:{channel.id}"
        msg = (
            f"🎫🎟 *تم فتح تكت (Ticket) جديدة!*\n"
            f"- اسم التكت: `{channel.name}`\n"
            f"- الآي دي: `{channel.id}`\n"
            f"- بواسطة اليوزر: `{creator_name}`\n"
            f"- الوقت: `{now}`"
        )
        send_telegram(msg, key)
    else:
        key = f"chan_create:{channel.id}"
        msg = (
            f"🎫 *تم إنشاء قناة جديدة!*\n"
            f"- الاسم: `{channel.name}`\n"
            f"- الوقت: `{now}`"
        )
        send_telegram(msg, key)

@client.event
async def on_guild_channel_delete(channel):
    now = datetime.now().strftime('%I:%M:%S %p')
    channel_name_lower = channel.name.lower()
    is_ticket = "ticket" in channel_name_lower or "تكت" in channel_name_lower

    if is_ticket:
        closer_name = "مسؤول أو بوت غير معروف"
        try:
            async for entry in channel.guild.audit_logs(limit=3, action=discord.AuditLogAction.channel_delete):
                if entry.target and entry.target.id == channel.id:
                    if (datetime.now(timezone.utc) - entry.created_at).total_seconds() < 10:
                        closer_name = entry.user.name
                        break
        except Exception:
            pass

        key = f"ticket_delete:{channel.id}"
        msg = (
            f"🔒🗑 *تم إغلاق/حذف تكت (Ticket)!*\n"
            f"- اسم التكت المغلقة: `{channel.name}`\n"
            f"- الآي دي: `{channel.id}`\n"
            f"- بواسطة: `{closer_name}`\n"
            f"- الوقت: `{now}`"
        )
        send_telegram(msg, key)

# ============================================================
# 5) رسالة جديدة
# ============================================================
@client.event
async def on_message(message):
    if message.author.bot:
        return
    now = datetime.now().strftime('%I:%M:%S %p')
    key = f"msg:{message.id}"
    msg = (
        f"💬 *رسالة جديدة*\n"
        f"- العضو: `{message.author.name}`\n"
        f"- الروم: `#{message.channel.name}`\n"
        f"- النص: {message.content}\n"
        f"- الوقت: `{now}`"
    )
    send_telegram(msg, key)

# ============================================================
# 6) تعديل رسالة وحذف رسالة
# ============================================================
@client.event
async def on_message_edit(before, after):
    if before.author.bot or before.content == after.content:
        return
    now = datetime.now().strftime('%I:%M:%S %p')
    # استخدام hashlib بدل hash() لضمان ثبات المفتاح بين تشغيلات البوت
    content_hash = hashlib.md5(after.content.encode("utf-8")).hexdigest()
    key = f"msg_edit:{before.id}:{content_hash}"
    msg = (
        f"✏️ *تم تعديل رسالة!*\n"
        f"- المرسل: `{before.author.name}`\n"
        f"- الروم: `#{before.channel.name}`\n"
        f"- القديم: {before.content}\n"
        f"- الجديد: {after.content}\n"
        f"- الوقت: `{now}`"
    )
    send_telegram(msg, key)

@client.event
async def on_message_delete(message):
    if message.author.bot:
        return
    now = datetime.now().strftime('%I:%M:%S %p')
    key = f"msg_del:{message.id}"
    msg = (
        f"🗑 *تم حذف رسالة!*\n"
        f"- المرسل: `{message.author.name}`\n"
        f"- الروم: `#{message.channel.name}`\n"
        f"- المحتوى المحذوف: {message.content}\n"
        f"- الوقت: `{now}`"
    )
    send_telegram(msg, key)

# ============================================================
# 7) التايم أوت (Timeout) وتحديثات الأعضاء والرولات
# ============================================================
@client.event
async def on_member_update(before, after):
    now = datetime.now().strftime('%I:%M:%S %p')

    # ----------------------------------------------------------
    # (أ) مراقبة إعطاء وإزالة الرولات (Roles Add / Remove)
    # ----------------------------------------------------------
    if before.roles != after.roles:
        before_roles_set = set(before.roles)
        after_roles_set = set(after.roles)

        added_roles = after_roles_set - before_roles_set
        removed_roles = before_roles_set - after_roles_set

        actor = "مسؤول غير معروف"
        try:
            async for entry in after.guild.audit_logs(limit=5, action=discord.AuditLogAction.member_role_update):
                if entry.target and entry.target.id == after.id:
                    if (datetime.now(timezone.utc) - entry.created_at).total_seconds() < 15:
                        actor = entry.user.name
                        break
        except Exception:
            pass

        for role in added_roles:
            key = f"role_add:{after.guild.id}:{after.id}:{role.id}"
            msg = (
                f"➕🛡 *تم إعطاء رول لعضو!*\n"
                f"- بواسطة المسؤول: `{actor}`\n"
                f"- العضو: `{after.name}`\n"
                f"- الآي دي: `{after.id}`\n"
                f"- الرول: `{role.name}`\n"
                f"- الوقت: `{now}`"
            )
            send_telegram(msg, key)

        for role in removed_roles:
            key = f"role_remove:{after.guild.id}:{after.id}:{role.id}"
            msg = (
                f"➖🛡 *تم إزالة رول من عضو!*\n"
                f"- بواسطة المسؤول: `{actor}`\n"
                f"- العضو: `{after.name}`\n"
                f"- الآي دي: `{after.id}`\n"
                f"- الرول: `{role.name}`\n"
                f"- الوقت: `{now}`"
            )
            send_telegram(msg, key)

    # ----------------------------------------------------------
    # (ب) مراقبة التايم أوت (Timeout Give / Remove)
    # ----------------------------------------------------------
    if before.timed_out_until != after.timed_out_until:
        if after.timed_out_until:
            duration_seconds = (after.timed_out_until - datetime.now(timezone.utc)).total_seconds()

            if duration_seconds >= 86400:
                duration_str = f"{round(duration_seconds / 86400, 1)} يوم"
            elif duration_seconds >= 3600:
                duration_str = f"{round(duration_seconds / 3600, 1)} ساعة"
            else:
                duration_str = f"{round(duration_seconds / 60)} دقيقة"

            actor = "مسؤول غير معروف"
            try:
                async for entry in after.guild.audit_logs(limit=3, action=discord.AuditLogAction.member_update):
                    if entry.target and entry.target.id == after.id:
                        if (datetime.now(timezone.utc) - entry.created_at).total_seconds() < 15:
                            actor = entry.user.name
                            break
            except Exception:
                pass

            key = f"timeout_give:{after.guild.id}:{after.id}:{int(after.timed_out_until.timestamp())}"
            msg = (
                f"⏳ *تم إعطاء تايم أوت (Timeout) لعضو!*\n"
                f"- بواسطة المسؤول: `{actor}`\n"
                f"- العضو المستهدف: `{after.name}`\n"
                f"- المدة بالتحديد: `{duration_str}` (~{int(duration_seconds)} ثانية)\n"
                f"- الوقت: `{now}`"
            )
            send_telegram(msg, key)
            return

        elif before.timed_out_until and not after.timed_out_until:
            actor = "مسؤول غير معروف"
            try:
                async for entry in after.guild.audit_logs(limit=3, action=discord.AuditLogAction.member_update):
                    if entry.target and entry.target.id == after.id:
                        if (datetime.now(timezone.utc) - entry.created_at).total_seconds() < 15:
                            actor = entry.user.name
                            break
            except Exception:
                pass

            key = f"timeout_remove:{after.guild.id}:{after.id}"
            msg = (
                f"⏱🔓 *تم رفع التايم أوت عن العضو!*\n"
                f"- بواسطة المسؤول: `{actor}`\n"
                f"- العضو: `{after.name}`\n"
                f"- الوقت: `{now}`"
            )
            send_telegram(msg, key)
            return

# ============================================================
# 8) الرومات الصوتية والميوت والتحكم الكامل
# ============================================================
@client.event
async def on_voice_state_update(member, before, after):
    now = datetime.now().strftime('%I:%M:%S %p')

    async def get_actor(action_type):
        try:
            async for entry in member.guild.audit_logs(limit=3, action=action_type):
                if entry.target and entry.target.id == member.id:
                    if (datetime.now(timezone.utc) - entry.created_at).total_seconds() < 10:
                        return entry.user.name
        except Exception:
            pass
        return "مسؤول غير معروف"

    if not before.mute and after.mute:
        actor = await get_actor(discord.AuditLogAction.member_update)
        key = f"server_mute:{member.guild.id}:{member.id}:muted"
        msg = (
            f"🔇 *تم إعطاء Server Mute للعضو!*\n"
            f"- بواسطة المسؤول: `{actor}`\n"
            f"- العضو المستهدف: `{member.name}`\n"
            f"- الوقت: `{now}`"
        )
        send_telegram(msg, key)
        return

    elif before.mute and not after.mute:
        actor = await get_actor(discord.AuditLogAction.member_update)
        key = f"server_unmute:{member.guild.id}:{member.id}:unmuted"
        msg = (
            f"🔊 *تم إزالة Server Mute عن العضو!*\n"
            f"- بواسطة المسؤول: `{actor}`\n"
            f"- العضو المستهدف: `{member.name}`\n"
            f"- الوقت: `{now}`"
        )
        send_telegram(msg, key)
        return

    if not before.deaf and after.deaf:
        actor = await get_actor(discord.AuditLogAction.member_update)
        key = f"server_deaf:{member.guild.id}:{member.id}:deafed"
        msg = (
            f"🔕 *تم إعطاء Server Deaf للعضو!*\n"
            f"- بواسطة المسؤول: `{actor}`\n"
            f"- العضو المستهدف: `{member.name}`\n"
            f"- الوقت: `{now}`"
        )
        send_telegram(msg, key)
        return

    elif before.deaf and not after.deaf:
        actor = await get_actor(discord.AuditLogAction.member_update)
        key = f"server_undeaf:{member.guild.id}:{member.id}:undeafed"
        msg = (
            f"🔔 *تم إزالة Server Deaf عن العضو!*\n"
            f"- بواسطة المسؤول: `{actor}`\n"
            f"- العضو المستهدف: `{member.name}`\n"
            f"- الوقت: `{now}`"
        )
        send_telegram(msg, key)
        return

    if before.channel == after.channel:
        return

    before_id = before.channel.id if before.channel else 0
    after_id  = after.channel.id  if after.channel  else 0

    if after.channel and not before.channel:
        key = f"voice_join:{member.guild.id}:{member.id}:{after_id}"
        msg = (
            f"🔊 *عضو دخل روم صوتي*\n"
            f"- العضو: `{member.name}`\n"
            f"- الروم: `{after.channel.name}`\n"
            f"- الوقت: `{now}`"
        )
    elif before.channel and not after.channel:
        key = f"voice_leave:{member.guild.id}:{member.id}:{before_id}"
        actor = await get_actor(discord.AuditLogAction.member_update)
        if actor != "مسؤول غير معروف":
            msg = (
                f"🚷 *تم فصل العضو (Disconnect) من الروم الصوتي*\n"
                f"- بواسطة: `{actor}`\n"
                f"- العضو: `{member.name}`\n"
                f"- من روم: `{before.channel.name}`\n"
                f"- الوقت: `{now}`"
            )
        else:
            msg = (
                f"🔇 *عضو غادر روم صوتي*\n"
                f"- العضو: `{member.name}`\n"
                f"- من روم: `{before.channel.name}`\n"
                f"- الوقت: `{now}`"
            )
    elif before.channel and after.channel:
        key = f"voice_move:{member.guild.id}:{member.id}:{before_id}:{after_id}"
        actor = await get_actor(discord.AuditLogAction.member_move)
        if actor != "مسؤول غير معروف":
            msg = (
                f"🔀 *تم نقل العضو (Move)*\n"
                f"- بواسطة: `{actor}`\n"
                f"- العضو: `{member.name}`\n"
                f"- من: `{before.channel.name}` ⬅️ إلى: `{after.channel.name}`\n"
                f"- الوقت: `{now}`"
            )
        else:
            msg = (
                f"🔀 *انتقال العضو بين الرومات الصوتية*\n"
                f"- العضو: `{member.name}`\n"
                f"- من: `{before.channel.name}` ⬅️ إلى: `{after.channel.name}`\n"
                f"- الوقت: `{now}`"
            )
    else:
        return

    send_telegram(msg, key)

# ============================================================
# تشغيل البوت
# ============================================================
if __name__ == "__main__":
    client.run(DISCORD_BOT_TOKEN)

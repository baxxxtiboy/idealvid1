"use strict";
/**
 * Telegram bot (qo'shimcha kutubxonasiz, faqat fetch).
 *  - PUBLIC_URL bor bo'lsa  -> webhook (Render uxlab qolsa ham Telegram uni uyg'otadi)
 *  - yo'q bo'lsa            -> long polling (lokal sinash uchun)
 */
const crypto = require("crypto");

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c],
  );

function createBot(h) {
  const token =
    process.env.BOT_TOKEN || "9201034746:AAGxlgnzQhV_dMW-pzpG5hXyu2PTG_IiFTc";
  const enabled = !!token;
  const api =
    (process.env.TG_API_BASE || "https://api.telegram.org") +
    "/bot" +
    token +
    "/";
  const publicUrl = (process.env.PUBLIC_URL || "").replace(/\/+$/, "");
  const salt = process.env.SECRET || "giv";
  const hookKey = crypto
    .createHash("sha256")
    .update("hook" + token + salt)
    .digest("hex")
    .slice(0, 24);
  const hookSecret = crypto
    .createHash("sha256")
    .update("sec" + token + salt)
    .digest("hex")
    .slice(0, 32);

  async function call(method, body) {
    const r = await fetch(api + method, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(`${method}: ${j.description || r.status}`);
    return j.result;
  }
  const send = (chat_id, text, extra = {}) =>
    call("sendMessage", {
      chat_id,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...extra,
    });

  async function sendPhoto(chat_id, buf, mime, caption, extra = {}) {
    const fd = new FormData();
    fd.append("chat_id", String(chat_id));
    fd.append("caption", String(caption).slice(0, 1000));
    fd.append("parse_mode", "HTML");
    if (extra.reply_markup)
      fd.append("reply_markup", JSON.stringify(extra.reply_markup));
    fd.append(
      "photo",
      new Blob([buf], { type: mime || "image/jpeg" }),
      "chek.jpg",
    );
    const r = await fetch(api + "sendPhoto", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error("sendPhoto: " + (j.description || r.status));
  }

  const webAppKb = () =>
    publicUrl.startsWith("https://")
      ? {
          inline_keyboard: [
            [{ text: "🛍 Katalogni ochish", web_app: { url: publicUrl } }],
          ],
        }
      : undefined;

  /** Mini App ichidan kelgan initData'ni tekshiradi, foydalanuvchini qaytaradi */
  function verifyInitData(initData) {
    if (!enabled || !initData) return null;
    try {
      const p = new URLSearchParams(initData);
      const hash = p.get("hash");
      if (!hash) return null;
      p.delete("hash");
      const dcs = [...p.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");
      const secret = crypto
        .createHmac("sha256", "WebAppData")
        .update(token)
        .digest();
      const calc = crypto
        .createHmac("sha256", secret)
        .update(dcs)
        .digest("hex");
      if (calc !== hash) return null;
      if (Date.now() / 1000 - Number(p.get("auth_date") || 0) > 86400 * 7)
        return null;
      return JSON.parse(p.get("user") || "null");
    } catch {
      return null;
    }
  }

  async function handleUpdate(u) {
    if (u.callback_query) return handleCallback(u.callback_query);
    const m = u.message;
    if (!m || !m.text) return;
    const chat = m.chat.id,
      text = m.text.trim();
    if (/^\/start/.test(text)) {
      return send(
        chat,
        `✨ <b>${esc(h.botName())}</b>\n\nFaset (bevils) shishalar, jilkalar, matovkalar va aksesuvarlar katalogi.\n` +
          (webAppKb()
            ? "Katalogni ochish uchun pastdagi tugmani bosing 👇"
            : "Katalog hozircha ochilmayapti (PUBLIC_URL sozlanmagan)."),
        webAppKb() ? { reply_markup: webAppKb() } : {},
      );
    }
    if (/^\/admin/.test(text)) {
      const code = text.split(/\s+/)[1] || "";
      if (h.verifyLinkCode(code)) {
        await h.setAdminChat(chat);
        return send(
          chat,
          "✅ Admin xabarnomalari shu chatga ulandi. Endi yangi buyurtma va to'lovlar shu yerga keladi.",
        );
      }
      return send(
        chat,
        "❌ Kod noto'g'ri yoki muddati o'tgan. Admin paneldan (Profil → Telegram) yangi kod oling.",
      );
    }
    if (/^\/help/.test(text))
      return send(
        chat,
        "/start — katalogni ochish\n/admin KOD — admin xabarnomalarini ulash",
      );
    return send(chat, "Katalogni ochish uchun /start ni bosing.");
  }

  async function handleCallback(q) {
    const chat = q.message && q.message.chat.id;
    if (!h.isAdminChat(chat))
      return call("answerCallbackQuery", {
        callback_query_id: q.id,
        text: "Ruxsat yo'q",
      });
    const [kind, orderId, payId] = String(q.data || "").split(":");
    const action = kind === "pc" ? "confirm" : kind === "pr" ? "reject" : null;
    if (!action)
      return call("answerCallbackQuery", { callback_query_id: q.id });
    try {
      await h.decidePayment(orderId, payId, action);
      await call("answerCallbackQuery", {
        callback_query_id: q.id,
        text: action === "confirm" ? "Tasdiqlandi ✅" : "Rad etildi ❌",
      });
      await call("editMessageReplyMarkup", {
        chat_id: chat,
        message_id: q.message.message_id,
        reply_markup: { inline_keyboard: [] },
      }).catch(() => {});
      await send(
        chat,
        action === "confirm" ? "✅ To'lov tasdiqlandi" : "❌ To'lov rad etildi",
      );
    } catch (e) {
      await call("answerCallbackQuery", {
        callback_query_id: q.id,
        text: e.message,
        show_alert: true,
      });
    }
  }

  /** Adminga xabar (ixtiyoriy chek rasmi va tasdiqlash tugmalari bilan) */
  async function notifyAdmin(text, opts = {}) {
    if (!enabled) return;
    const chat = h.adminChat();
    if (!chat) return;
    const reply_markup = opts.pay
      ? {
          inline_keyboard: [
            [
              {
                text: "✅ Tasdiqlash",
                callback_data: `pc:${opts.pay.orderId}:${opts.pay.payId}`,
              },
              {
                text: "❌ Rad etish",
                callback_data: `pr:${opts.pay.orderId}:${opts.pay.payId}`,
              },
            ],
          ],
        }
      : undefined;
    try {
      if (opts.chek)
        await sendPhoto(chat, opts.chek.buf, opts.chek.mime, text, {
          reply_markup,
        });
      else await send(chat, text, reply_markup ? { reply_markup } : {});
    } catch (e) {
      console.error("Bot (admin xabari):", e.message);
      try {
        await send(chat, text, reply_markup ? { reply_markup } : {});
      } catch {}
    }
  }
  async function notifyUser(tgId, text) {
    if (!enabled || !tgId) return;
    try {
      await send(tgId, text, webAppKb() ? { reply_markup: webAppKb() } : {});
    } catch (e) {
      console.error("Bot (mijoz xabari):", e.message);
    }
  }

  function checkHook(key, secretHeader) {
    return enabled && key === hookKey && secretHeader === hookSecret;
  }

  async function start() {
    if (!enabled) {
      console.log("Bot: BOT_TOKEN yo'q — bot o'chiq, veb-ilova ishlayveradi.");
      return;
    }
    try {
      await call("setMyCommands", {
        commands: [
          { command: "start", description: "Katalogni ochish" },
          { command: "help", description: "Yordam" },
        ],
      });
      if (publicUrl.startsWith("https://")) {
        await call("setChatMenuButton", {
          menu_button: {
            type: "web_app",
            text: "Katalog",
            web_app: { url: publicUrl },
          },
        });
      }
      if (publicUrl && process.env.BOT_MODE !== "polling") {
        await call("setWebhook", {
          url: `${publicUrl}/tg/${hookKey}`,
          secret_token: hookSecret,
          allowed_updates: ["message", "callback_query"],
        });
        console.log("Bot: webhook ulandi ->", publicUrl);
      } else {
        await call("deleteWebhook", {}).catch(() => {});
        console.log("Bot: long polling rejimi");
        poll();
      }
    } catch (e) {
      console.error("Bot ishga tushmadi:", e.message);
    }
  }
  async function poll() {
    let offset = 0;
    for (;;) {
      try {
        const ups = await call("getUpdates", {
          offset,
          timeout: 25,
          allowed_updates: ["message", "callback_query"],
        });
        for (const u of ups) {
          offset = u.update_id + 1;
          handleUpdate(u).catch((e) => console.error("Bot:", e.message));
        }
      } catch (e) {
        console.error("Bot polling:", e.message);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  return {
    enabled,
    start,
    handleUpdate,
    checkHook,
    verifyInitData,
    notifyAdmin,
    notifyUser,
    esc,
  };
}

module.exports = createBot;

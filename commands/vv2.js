const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

module.exports = {
  pattern: "vv2",
  desc: "Open view-once & send to bot + user inbox ❤️",
  category: "utility",
  react: "❤️",
  filename: __filename,
  use: "<reply to a view-once media>",

  execute: async (conn, message, m, { from, reply, sender }) => {
    // ── Helper: send a text with newsletter context info ──────────────────
    const sendText = async (text, destination, quoted = message) => {
      return await conn.sendMessage(destination, {
        text: text,
        contextInfo: {
          forwardingScore: 999,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: "120363403964756123@newsletter",
            newsletterName: "𝐃ʀ 𝐇ᴏɴᴇʏ 𝐓ᴇᴄʜ𝐗 💀",
            serverMessageId: 200,
          },
        },
      }, { quoted: quoted });
    };

    // ── Helper: send media to a JID ───────────────────────────────────────
    const sendMedia = async (destination, mediaType, buffer, innerNode, ctx, quotedMsg = message) => {
      if (mediaType === "image") {
        await conn.sendMessage(destination, {
          image: buffer,
          caption: "👁️ View-once image — unlocked by ❤️ .vv2",
          contextInfo: ctx,
        }, { quoted: quotedMsg });
      } else if (mediaType === "video") {
        await conn.sendMessage(destination, {
          video: buffer,
          caption: "👁️ View-once video — unlocked by ❤️ .vv2",
          contextInfo: ctx,
        }, { quoted: quotedMsg });
      } else if (mediaType === "audio") {
        await conn.sendMessage(destination, {
          audio: buffer,
          mimetype: innerNode.mimetype || "audio/mp4",
          ptt: innerNode.ptt || false,
          contextInfo: ctx,
        }, { quoted: quotedMsg });
      } else if (mediaType === "sticker") {
        await conn.sendMessage(destination, {
          sticker: buffer,
          contextInfo: ctx,
        }, { quoted: quotedMsg });
      } else if (mediaType === "document") {
        await conn.sendMessage(destination, {
          document: buffer,
          fileName: innerNode.fileName || "file",
          contextInfo: ctx,
        }, { quoted: quotedMsg });
      }
    };

    try {
      // ── 1. Resolve quoted node ──────────────────────────────────────────
      let quotedNode = null;

      if (m && m.quoted) {
        if (m.quoted.message && m.quoted.message.message) {
          quotedNode = m.quoted.message.message;
        } else if (m.quoted.message) {
          quotedNode = m.quoted.message;
        } else {
          quotedNode = m.quoted;
        }
      } else if (message?.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        quotedNode = message.message.extendedTextMessage.contextInfo.quotedMessage;
      } else if (message?.quoted) {
        quotedNode = message.quoted;
      }

      if (!quotedNode) {
        return await sendText("🍁 Please reply to a *view-once* message with `.vv2`.", from);
      }

      // ── 2. Unwrap view-once wrapper ─────────────────────────────────────
      let viewOnceWrapper =
        quotedNode.viewOnceMessage ||
        quotedNode.viewOnceMessageV2 ||
        (quotedNode.message &&
          (quotedNode.message.viewOnceMessage || quotedNode.message.viewOnceMessageV2)) ||
        null;

      let innerPayload = null;
      if (viewOnceWrapper) innerPayload = viewOnceWrapper.message || viewOnceWrapper;
      else innerPayload = quotedNode.message || quotedNode;

      const innerNode =
        innerPayload.imageMessage ||
        innerPayload.videoMessage ||
        innerPayload.audioMessage ||
        innerPayload.stickerMessage ||
        innerPayload.documentMessage ||
        null;

      if (!innerNode) {
        return await sendText("❌ That's not a view-once media.", from);
      }

      // ── 3. Detect media type ────────────────────────────────────────────
      let mediaType = null;
      if (innerPayload.imageMessage || innerNode?.mimetype?.startsWith?.("image")) mediaType = "image";
      else if (innerPayload.videoMessage || innerNode?.mimetype?.startsWith?.("video")) mediaType = "video";
      else if (innerPayload.audioMessage || innerNode?.mimetype?.startsWith?.("audio")) mediaType = "audio";
      else if (innerPayload.stickerMessage) mediaType = "sticker";
      else if (innerPayload.documentMessage) mediaType = "document";

      if (!mediaType) {
        return await sendText("❌ Unsupported media type in view-once message.", from);
      }

      // ── 4. Send reaction ────────────────────────────────────────────────
      try {
        await conn.sendMessage(from, {
          react: { text: module.exports.react, key: message.key },
        });
      } catch (e) {}

      // ── 5. Download the media ───────────────────────────────────────────
      let buffer = null;

      try {
        if (m && m.quoted && typeof m.quoted.download === "function") {
          buffer = await m.quoted.download();
        } else if (quotedNode && typeof quotedNode.download === "function") {
          buffer = await quotedNode.download();
        }
      } catch (err) {
        console.error("vv2 download error (method-1):", err?.message || err);
      }

      if (!buffer) {
        try {
          const stream = await downloadContentFromMessage(innerNode, mediaType);
          let tmp = Buffer.from([]);
          for await (const chunk of stream) {
            tmp = Buffer.concat([tmp, chunk]);
          }
          buffer = tmp;
        } catch (err) {
          console.error("vv2 download error (method-2):", err);
          return await sendText("❌ Failed to download the view-once media.", from);
        }
      }

      if (!buffer || buffer.length === 0) {
        return await sendText("❌ Downloaded view-once media is empty.", from);
      }

      // ── 6. Shared context info ──────────────────────────────────────────
      const contextInfo = {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: "120363403964756123@newsletter",
          newsletterName: "𝐃ʀ 𝐇ᴏɴᴇʏ 𝐓ᴇᴄʜ𝐗 💀",
          serverMessageId: 200,
        },
      };

      // ── 7. Get bot's own JID ────────────────────────────────────────────
      const botJid = conn.user?.id || conn.user?.jid || null;

      // ── 8. Normalise sender JID (remove device suffix if present) ───────
      //   e.g. "923001234567:5@s.whatsapp.net" → "923001234567@s.whatsapp.net"
      const normaliseSender = (jid) => {
        if (!jid) return null;
        const bare = jid.split(":")[0];
        const domain = jid.includes("@") ? "@" + jid.split("@")[1] : "@s.whatsapp.net";
        return bare + domain;
      };

      const senderJid = normaliseSender(sender);
      const botJidNorm = normaliseSender(botJid);

      // ── 9. Send to GROUP / CHAT (original behaviour) ────────────────────
      await sendMedia(from, mediaType, buffer, innerNode, contextInfo);

      // ── 10. Send to COMMAND USER's private inbox ─────────────────────────
      if (senderJid && senderJid !== from) {
        try {
          await sendText(
            `❤️ *[VV2]* View-once media saved to your inbox!\n👤 Sent from: ${from}`,
            senderJid,
            null
          );
          await sendMedia(senderJid, mediaType, buffer, innerNode, contextInfo, null);
          console.log(`📩 vv2: sent to user inbox → ${senderJid}`);
        } catch (err) {
          console.error("vv2: failed to send to user inbox:", err?.message || err);
        }
      }

      // ── 11. Send to BOT's own inbox ──────────────────────────────────────
      if (botJidNorm && botJidNorm !== from && botJidNorm !== senderJid) {
        try {
          await sendText(
            `🤖 *[VV2 LOG]* View-once captured!\n👤 By: ${senderJid}\n📍 From: ${from}`,
            botJidNorm,
            null
          );
          await sendMedia(botJidNorm, mediaType, buffer, innerNode, contextInfo, null);
          console.log(`📩 vv2: sent to bot inbox → ${botJidNorm}`);
        } catch (err) {
          console.error("vv2: failed to send to bot inbox:", err?.message || err);
        }
      }

      // ── 12. Confirm in original chat ─────────────────────────────────────
      await sendText(
        "✅ *View-once media unlocked!*\n❤️ Sent to your inbox & bot inbox.",
        from
      );

    } catch (err) {
      console.error("vv2.js error:", err);
      await conn.sendMessage(from, { text: "❌ Failed to open view-once media." });
    }
  },
};

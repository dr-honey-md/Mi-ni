const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const { videoToWebp, imageToWebp } = require('../lib/video-utils');
const { Sticker, StickerTypes } = require("wa-sticker-formatter");

module.exports = {
  pattern: "s",
  desc: "Convert media to sticker with optional custom author name",
  category: "sticker",
  react: "🔄",
  filename: __filename,
  use: "<reply to media> [author name]",

  execute: async (conn, message, m, { from, q, reply }) => {
    const sendText = async (text, quoted = message) => {
      return conn.sendMessage(from, { text }, { quoted });
    };

    try {
      const authorName = q ? q.trim() : "© ᴩᴏᴡᴇʀᴇᴅ ʙʏ : ᴅʀ ʜᴏɴᴇʏ ᴛᴇᴄʜx";
      const packName = "";

      // ── Resolve media node ──────────────────────────────────────────────
      // Priority: quoted message → caption media (sent with .s as caption)
      const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const directMsg = message.message;

      let mediaNode = null;
      let mediaType = null;
      let downloadSource = null; // the actual node to pass to downloadContentFromMessage

      const detectMedia = (node) => {
        if (!node) return false;
        if (node.imageMessage)   { mediaNode = node.imageMessage;   mediaType = "image";   downloadSource = node.imageMessage;   return true; }
        if (node.videoMessage)   { mediaNode = node.videoMessage;   mediaType = "video";   downloadSource = node.videoMessage;   return true; }
        if (node.stickerMessage) { mediaNode = node.stickerMessage; mediaType = "sticker"; downloadSource = node.stickerMessage; return true; }
        return false;
      };

      if (!detectMedia(quotedMsg) && !detectMedia(directMsg)) {
        return await sendText("*Please reply to an image, video or sticker.*\n\n*Usage:* .s [author name]");
      }

      // ── React ───────────────────────────────────────────────────────────
      try {
        await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
      } catch (e) {}

      // ── Download ────────────────────────────────────────────────────────
      let buffer = null;

      // Try quoted download helper first (faster)
      try {
        if (m?.quoted && typeof m.quoted.download === "function") {
          buffer = await m.quoted.download();
        }
      } catch (e) {
        console.error("sticker: quoted.download() failed:", e?.message);
      }

      // Fallback: stream download
      if (!buffer || buffer.length === 0) {
        try {
          const stream = await downloadContentFromMessage(downloadSource, mediaType);
          let tmp = Buffer.from([]);
          for await (const chunk of stream) tmp = Buffer.concat([tmp, chunk]);
          buffer = tmp;
        } catch (e) {
          console.error("sticker: stream download failed:", e);
          return await sendText("❌ Failed to download media. Try replying to a valid image/video/sticker.");
        }
      }

      if (!buffer || buffer.length === 0) {
        return await sendText("❌ Downloaded media is empty.");
      }

      // ── If already a sticker — re-wrap with metadata & resend ───────────
      if (mediaType === "sticker") {
        try {
          const sticker = new Sticker(buffer, {
            pack: packName,
            author: authorName,
            type: StickerTypes.FULL,
            quality: 75,
            background: "transparent",
          });
          const out = await sticker.toBuffer();
          return await conn.sendMessage(from, { sticker: out }, { quoted: message });
        } catch (e) {
          console.error("sticker: re-wrap error:", e);
          return await conn.sendMessage(from, { sticker: buffer }, { quoted: message });
        }
      }

      // ── Convert image / video → WebP ────────────────────────────────────
      let webpBuffer = null;
      try {
        if (mediaType === "image") {
          webpBuffer = await imageToWebp(buffer);
        } else {
          webpBuffer = await videoToWebp(buffer);
        }
      } catch (e) {
        console.error("sticker: conversion error:", e);
        return await sendText("❌ Failed to convert media. Make sure FFmpeg is installed.");
      }

      if (!webpBuffer || webpBuffer.length === 0) {
        return await sendText("❌ Conversion produced empty output.");
      }

      // ── Build & send sticker ─────────────────────────────────────────────
      try {
        const sticker = new Sticker(webpBuffer, {
          pack: packName,
          author: authorName,
          type: StickerTypes.FULL,
          quality: 75,
          background: "transparent",
        });
        const out = await sticker.toBuffer();
        await conn.sendMessage(from, { sticker: out }, { quoted: message });
      } catch (e) {
        console.error("sticker: formatter error:", e);
        // Send raw webp as fallback
        await conn.sendMessage(from, { sticker: webpBuffer }, { quoted: message });
      }

    } catch (err) {
      console.error("sticker.js error:", err);
      await sendText("❌ Sticker conversion failed.");
    }
  }
};

require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');

// Initialize bot with token from environment variables
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

const API_BASE = 'https://apispec.litype.workers.dev';
const SEARCH_ENDPOINT = `${API_BASE}/ytsearch`;
const DOWNLOAD_ENDPOINT = `${API_BASE}/ytdl/download`;

// Start command
bot.start((ctx) => {
    ctx.reply(
        '👋 *Welcome!* I am your Music Bot.\n\n' +
        '🎵 Use `/play <song name or YouTube link>` to download and send audio directly!\n' +
        '📝 *Example:* `/play Awaara`',
        { parse_mode: 'Markdown' }
    );
});

// Play command
bot.command('play', async (ctx) => {
    // Extract query after "/play "
    const query = ctx.message.text.split(' ').slice(1).join(' ').trim();

    if (!query) {
        return ctx.reply(
            '❌ *Usage:* `/play <song name or YouTube link>`\n' +
            '📝 *Example:* `/play Awaara`',
            { parse_mode: 'Markdown' }
        );
    }

    try {
        let videoId;
        let videoTitle = 'Unknown Title';
        let duration = '0:00';
        let thumbnail = '';

        const isUrl = /youtube\.com|youtu\.be/i.test(query);

        if (isUrl) {
            const match = query.match(/(?:v=|\/)([\w-]{11})(?:[&?]|$)/);
            if (match && match[1]) {
                videoId = match[1];
            } else {
                throw new Error('Invalid YouTube URL format.');
            }
            videoTitle = 'YouTube Audio';
        } else {
            await ctx.replyWithChatAction('typing');

            const searchUrl = `${SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}&limit=1`;
            const searchRes = await axios.get(searchUrl, {
                timeout: 30000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });

            if (!searchRes.data || !searchRes.data.ok || !searchRes.data.results || !searchRes.data.results.length) {
                throw new Error('No results found on YouTube.');
            }

            const video = searchRes.data.results[0];
            videoId = video.video_id;
            videoTitle = video.title || 'Unknown Title';
            duration = video.duration || '0:00';
            thumbnail = video.thumbnail || video.thumbnail_hq || video.thumbnail_hd || '';
        }

        const loadingMsg = await ctx.reply(
            `⏳ *Searching & downloading...*\n🎵 ${videoTitle.substring(0, 40)}...`,
            { parse_mode: 'Markdown' }
        );

        const downloadUrl = `${DOWNLOAD_ENDPOINT}?url=${encodeURIComponent(videoId)}&format=mp3`;
        const audioRes = await axios.get(downloadUrl, {
            responseType: 'arraybuffer',
            timeout: 60000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Referer': 'https://www.youtube.com/'
            }
        });

        const audioBuffer = Buffer.from(audioRes.data);

        if (!audioBuffer || audioBuffer.length === 0) {
            throw new Error('Downloaded audio is empty.');
        }

        // Delete loading message
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});

        const safeFileName = `${videoTitle.replace(/[^\w\s]/gi, '').substring(0, 40)}.mp3`;
        const displayTitle = videoTitle.length > 35 ? videoTitle.substring(0, 35) + '...' : videoTitle;

        // Send audio to user
        await ctx.replyWithAudio(
            { source: audioBuffer, filename: safeFileName },
            {
                title: displayTitle,
                performer: `Duration: ${duration} | Quality: 320k`,
                // Note: Telegram requires thumbnails to be JPEG, < 200KB, and max 320x320. 
                // Omitted here to prevent upload errors, but the audio will still have metadata.
            }
        );

    } catch (e) {
        console.error('[play] Error:', e.message);
        return ctx.reply(`🔴 *Failed:* ${e.message}`, { parse_mode: 'Markdown' });
    }
});

// Launch the bot
console.log('🤖 Bot is starting...');
bot.launch();

// Enable graceful stop (for hosting platforms like Railway, Render, etc.)
process.once('SIGINT', () => {
    console.log('🛑 SIGINT received, stopping bot...');
    bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
    console.log('🛑 SIGTERM received, stopping bot...');
    bot.stop('SIGTERM');
});

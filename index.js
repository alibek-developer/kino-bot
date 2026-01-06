require('dotenv').config()
const { Bot, InlineKeyboard } = require('grammy')
const { MongoClient } = require('mongodb')

const bot = new Bot(process.env.TELEGRAM_TOKEN)

// Sozlamalar
const CHANNELS = process.env.CHANNELS.split(',').map(ch => ch.trim())
const KINOLAR_KANAL = process.env.KINOLAR_KANAL // masalan @kinolaruser
const MONGO_URL = process.env.MONGO_URL

let db, collection

;(async () => {
	const client = new MongoClient(MONGO_URL)
	await client.connect()
	db = client.db('kinochi_bot')
	collection = db.collection('videos')
	console.log('MongoDB ga ulandi!')
})()

// Obuna tekshirish funksiyasi
async function checkSubscription(userId) {
	for (const channel of CHANNELS) {
		try {
			const member = await bot.api.getChatMember(channel, userId)
			if (!['member', 'administrator', 'creator'].includes(member.status)) {
				return false
			}
		} catch (error) {
			return false // kanal topilmadi yoki bot admin emas
		}
	}
	return true
}

// Obuna bo'lmaganlarga tugmalar bilan so'rov
async function askToSubscribe(ctx) {
	const keyboard = new InlineKeyboard()

	for (const channel of CHANNELS) {
		keyboard.url(channel, `https://t.me/${channel.substring(1)}`)
	}

	keyboard.row().text('✅ Tekshirish', 'check_subscription')

	await ctx.reply(
		"Botdan foydalanish uchun quyidagi kanallarga obuna bo'ling:",
		{
			reply_markup: keyboard,
		}
	)
}

// /start buyrug'i
bot.command('start', async ctx => {
	const subscribed = await checkSubscription(ctx.from.id)
	if (subscribed) {
		await ctx.reply('Salom! 🎬\nKino kodini yozing (masalan: 12, 34, 4554)')
	} else {
		await askToSubscribe(ctx)
	}
})

// Tekshirish tugmasi bosilganda
bot.callback('check_subscription', async ctx => {
	await ctx.answerCallbackQuery()
	const subscribed = await checkSubscription(ctx.from.id)
	if (subscribed) {
		await ctx.reply("✅ A'zo bo'ldingiz! Endi kino kodini yozing.")
	} else {
		await ctx.reply("❌ Hali barcha kanallarga obuna bo'lmagansiz.")
	}
})

// Kanalga video kelganda saqlash
bot.on('channel_post:video', async ctx => {
	if (ctx.channelPost.chat.username === KINOLAR_KANAL.substring(1)) {
		await collection.insertOne({
			file_id: ctx.channelPost.video.file_id,
			caption: ctx.channelPost.caption || '',
		})
		console.log('Yangi video saqlandi!')
	}
})

// Har qanday xabarga javob (obuna + kod qidiruv)
bot.on('message', async ctx => {
	if (ctx.chat.type !== 'private') return

	const subscribed = await checkSubscription(ctx.from.id)
	if (!subscribed) {
		await askToSubscribe(ctx)
		return
	}

	const text = ctx.message.text?.trim()

	if (!text || !/^\d+$/.test(text)) {
		return ctx.reply('❌ Faqat kino kodini yozing (raqamlar, masalan: 12)')
	}

	const kod = text

	const video = await collection.findOne({
		caption: { $regex: `Kod: ${kod}`, $options: 'i' },
	})

	if (!video) {
		return ctx.reply(`😢 Kod ${kod} bo'yicha kino topilmadi.`)
	}

	try {
		await ctx.replyWithVideo(video.file_id, { caption: video.caption })
		await ctx.reply("✅ Kino yuborildi! Izlab ko'ring 🍿")
	} catch (error) {
		await ctx.reply('❌ Video yuborishda xato yuz berdi.')
	}
})

bot.start()
console.log('Kino bot ishga tushdi! 🎬')

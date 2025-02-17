    const TelegramBot = require('node-telegram-bot-api');
    const { google } = require('googleapis');
    const fs = require('fs');
    const path = require('path');
    const creds = require('./google-credentials.json'); // Google Sheets xizmatining JSON kaliti

    const token = ''; // Telegram bot tokeni
    const bot = new TelegramBot(token, { polling: true });

    const auth = new google.auth.GoogleAuth({
        credentials: creds,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const SPREADSHEET_ID = ''; // Google Sheets ID
    const userLanguages = {}; // Foydalanuvchi tillarini saqlash uchun obyekt
    
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    sendLanguageSelection(chatId);
});

// Til tanlash menyusini chiqarish funksiyasi
function sendLanguageSelection(chatId) {
    bot.sendMessage(chatId, "Tilni tanlang | Выберите язык", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🇺🇿 Uzbekcha", callback_data: "lang_uz" },{ text: "🇷🇺 Русский", callback_data: "lang_ru" }],
                
            ]
        }
    });
}

// Til tanlash handleri
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    
    if (data === "lang_uz") {
        userLanguages[chatId] = "uz";
        sendMainMenu(chatId, "uz");
    } else if (data === "lang_ru") {
        userLanguages[chatId] = "ru";
        sendMainMenu(chatId, "ru");
    }
});

// Asosiy menyuni chiqarish funksiyasi
function sendMainMenu(chatId, lang) {
    let message = lang === "uz" 
        ? "Xush kelibsiz! Online yordamchi YOURBRAND tayyor. 📌 Kategoriyalardan birini tanlang:"
        : "Добро пожаловать! Онлайн-помощник YOURBRAND готов. 📌 Выберите категорию:";

    let keyboard = lang === "uz" 
        ? [
            [{ text: "Sotuvdagi mahsulotlar" }, { text: "Brak mahsulotlar" }],
            [{ text: "Brendlar" }, { text: "Ijtimoiy tarmoqlar" }],
            [{ text: "Catalog" }, { text: "🔍 Mahsulotni izlash" }],
            [{ text: "🌍 Tilni o‘zgartirish" }]
        ]
        : [
            [{ text: "Товары в продаже" }, { text: "Бракованные товары" }],
            [{ text: "Бренды" }, { text: "Социальные сети" }],
            [{ text: "Каталог" }, { text: "🔍 Поиск товара" }],
            [{ text: "🌍 Изменить язык" }]
        ];

    bot.sendMessage(chatId, message, {
        reply_markup: {
            keyboard: keyboard,
            resize_keyboard: true
        }
    });
}



// Foydalanuvchi tilni o‘zgartirish tugmachasini bosganda
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === "🌍 Tilni o‘zgartirish" || text === "🌍 Изменить язык") {
        sendLanguageSelection(chatId);
    }
});


    // Markdown belgilarini eskaplash funksiyasi
    function escapeMarkdown(text) {
        return text.replace(/[*_`\[\]()]/g, '\\$&');
    }

    // Kategoriyalarni yuklash funksiyasi
    async function getCategories() {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Sheet1!A2:A',
        });
        const rows = res.data.values;
        if (!rows || rows.length === 0) return [];
        return [...new Set(rows.flat())]; // Noyob kategoriyalar
    }

    // Subkategoriyalarni yuklash funksiyasi
    async function getSubcategories(category) {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Sheet1!A2:F',
        });
        const rows = res.data.values;
        if (!rows || rows.length === 0) return [];

        return [...new Set(rows
            .filter(row => row[0] === category)
            .map(row => row[5]))]; // Subkategoriya ustuni (F ustuni), noyob qiymatlar
    }

    // Mahsulotlarni yuklash funksiyasi
    async function getProducts(category, subcategory) {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Sheet1!A2:F',
        });
        const rows = res.data.values;
        if (!rows || rows.length === 0) return [];

        const filteredProducts = rows
            .filter(row => row[0] === category && row[5] === subcategory)
            .map(row => ({
                model: row[1]?.trim(),
                price: row[2]?.trim(),
                quantity: row[3]?.trim(),
                imageUrls: row[4] ? row[4].split(',').map(url => url.trim()) : [],
            }));
        
        console.log("Filtered products:", filteredProducts);
        return filteredProducts;
    }

    // `/sale` komandasi uchun handler
    bot.onText(/Sotuvdagi mahsulotlar|Товары в продаже/, async (msg) => {
        const chatId = msg.chat.id;
        const lang = userLanguages[chatId] || "uz";
        const categories = await getCategories();
        if (categories.length === 0) {
            bot.sendMessage(chatId, lang === "uz" ? '📌 Hech qanday mahsulot topilmadi.' : '📌 Товары не найдены.');
            return;
        }
        const categoryButtons = [];
            for (let i = 0; i < categories.length; i += 3) {
                categoryButtons.push(categories.slice(i, i + 3).map(cat => ({ text: cat, callback_data: `category_${cat}` })));
            }

        bot.sendMessage(chatId, lang === "uz" ? '📌 Kategoriyalardan birini tanlang:' : '📌 Выберите категорию:', {
            reply_markup: { inline_keyboard: categoryButtons },
        });
    });

    // Callback query uchun handler
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const lang = userLanguages[chatId] || "uz"; // Foydalanuvchining tanlagan tilini olish

    if (data.startsWith('category_')) {
        const category = data.replace('category_', '');
        const subcategories = await getSubcategories(category);
        const subcategoryButtons = subcategories.map(sub => [{ text: sub, callback_data: `subcategory_${category}_${sub}` }]);

        const messageText = lang === "uz" 
            ? `📌 \"${escapeMarkdown(category)}\" kategoriyasidagi subkategoriyalardan birini tanlang:` 
            : `📌 Выберите подкатегорию из категории \"${escapeMarkdown(category)}\":`;

        bot.sendMessage(chatId, messageText, {
            reply_markup: { inline_keyboard: subcategoryButtons },
        });

    } else if (data.startsWith('subcategory_')) {
        const [_, category, subcategory] = data.split('_');
        const products = await getProducts(category, subcategory);

        console.log(`Category: ${category}, Subcategory: ${subcategory}`);
        console.log("Products:", products);

        if (products.length === 0) {
            bot.sendMessage(chatId, lang === "uz" 
                ? 'Bu subkategoriyada hech qanday mahsulot topilmadi.' 
                : 'В этой подкатегории товары не найдены.');
            return;
        }

        for (const product of products) {
            if (product.imageUrls.length > 0) {
                let mediaGroup = product.imageUrls.map((imageUrl, index) => ({
                    type: 'photo',
                    media: imageUrl,
                    caption: index === 0 
                        ? (lang === "uz" 
                            ? `📌 Model: ${escapeMarkdown(product.model)}\n💰 Narxi: ${escapeMarkdown(product.price)} USD\n📦 Mavjudligi: ${product.quantity > 5 ? "5+" : escapeMarkdown(product.quantity)} dona` 
                            : `📌 Модель: ${escapeMarkdown(product.model)}\n💰 Цена: ${escapeMarkdown(product.price)} USD\n📦 В наличии: ${product.quantity > 5 ? "5+" : escapeMarkdown(product.quantity)} шт`)
                        : '',
                    parse_mode: 'Markdown'
                }));
                await bot.sendMediaGroup(chatId, mediaGroup);
            } else {
                bot.sendMessage(chatId, lang === "uz" 
                    ? `📌 Model: ${escapeMarkdown(product.model)}\n💰 Narxi: ${escapeMarkdown(product.price)} USD\n📦 Mavjudligi: ${product.quantity > 5 ? "5+" : escapeMarkdown(product.quantity)} dona` 
                    : `📌 Модель: ${escapeMarkdown(product.model)}\n💰 Цена: ${escapeMarkdown(product.price)} USD\n📦 В наличии: ${product.quantity > 5 ? "5+" : escapeMarkdown(product.quantity)} шт`, 
                    { parse_mode: 'Markdown' });
            }
            
        }

        // Mahsulotlar chiqarilgandan keyin yana kategoriyalarni ko'rsatish
        const categories = await getCategories();
        const categoryButtons = [];
        for (let i = 0; i < categories.length; i += 3) {
            categoryButtons.push(categories.slice(i, i + 3).map(cat => ({ text: cat, callback_data: `category_${cat}` })));
        }

        bot.sendMessage(chatId, lang === "uz" 
            ? '📌 Kategoriyalardan birini tanlang:' 
            : '📌 Выберите одну из категорий:', {
            reply_markup: { inline_keyboard: categoryButtons },
        });
    }    
});


    // Brak mahsulot kategoriyalarini yuklash funksiyasi
    async function getDefectiveCategories() {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Sheet2!A2:A',
        });
        const rows = res.data.values;
        if (!rows || rows.length === 0) return [];
        return [...new Set(rows.flat())]; // Noyob kategoriyalar
    }

    // Brak mahsulotlarni yuklash funksiyasi
    async function getDefectiveProducts(category) {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Sheet2!A2:C',
        });
        const rows = res.data.values;
        if (!rows || rows.length === 0) return [];

        return rows.filter(row => row[0] === category).map(row => ({
            name: row[0]?.trim(),
            model: row[1]?.trim(),
            img: row[2]?.trim(),
        }));
    }

    // `/defective` komandasi uchun handler
    bot.onText(/Brak mahsulotlar|Бракованные товары/, async (msg) => {
        const chatId = msg.chat.id;
        const lang = userLanguages[chatId] || "uz";
        const categories = await getDefectiveCategories();
        if (categories.length === 0) {
            bot.sendMessage(chatId, lang === "uz" ? '📌 Hech qanday brak mahsulot topilmadi.' : '📌 Бракованных товаров не найдено.');
            return;
        }
        const categoryButtons = categories.map(cat => [{ text: cat, callback_data: `defective_category_${cat}` }]);
        bot.sendMessage(chatId, lang === "uz" ? '📌 Brak mahsulot kategoriyalaridan birini tanlang:' : '📌 Выберите категорию бракованных товаров:', {
            reply_markup: { inline_keyboard: categoryButtons },
        });
    });

   // Callback query uchun handler
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const lang = userLanguages[chatId] || "uz"; // Foydalanuvchining tanlagan tilini olish

    if (data.startsWith('defective_category_')) {
        const category = data.replace('defective_category_', '');
        const defectiveProducts = await getDefectiveProducts(category);

        if (defectiveProducts.length === 0) {
            bot.sendMessage(chatId, lang === "uz" 
                ? `📌 "${escapeMarkdown(category)}" kategoriyasida brak mahsulot topilmadi.` 
                : `📌 В категории "${escapeMarkdown(category)}" бракованные товары не найдены.`);
            return;
        }

        for (const product of defectiveProducts) {
            if (product.img) {
                bot.sendPhoto(chatId, product.img, {
                    caption: lang === "uz" 
                        ? `📌 Nomi: ${escapeMarkdown(product.name)}\n📌 Model: ${escapeMarkdown(product.model)}`
                        : `📌 Название: ${escapeMarkdown(product.name)}\n📌 Модель: ${escapeMarkdown(product.model)}`,
                    parse_mode: 'Markdown'
                });
            } else {
                bot.sendMessage(chatId, lang === "uz" 
                    ? `📌 Nomi: ${escapeMarkdown(product.name)}\n📌 Model: ${escapeMarkdown(product.model)}`
                    : `📌 Название: ${escapeMarkdown(product.name)}\n📌 Модель: ${escapeMarkdown(product.model)}`,
                    { parse_mode: 'Markdown' });
            }
        }

        // `/defective` qaytadan chaqirish
        const categories = await getDefectiveCategories();
        if (categories.length > 0) {
            const categoryButtons = categories.map(cat => [{ text: cat, callback_data: `defective_category_${cat}` }]);
            bot.sendMessage(chatId, lang === "uz" 
                ? '📌 Brak mahsulot kategoriyalaridan birini tanlang:' 
                : '📌 Выберите одну из категорий бракованных товаров:', {
                reply_markup: { inline_keyboard: categoryButtons },
            });
        }
    }
});


// **1️⃣ Katalog tugmalarini "Sheet3" dan yuklash**
async function getCatalogsFromSheets() {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet3!A2:B', // Katalog nomi va PDF URL
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) {
        return [];
    }

    return rows.map(row => ({ name: row[0], url: row[1] }));
}

// **2️⃣ Katalog tugmalarini chiqarish**
bot.onText(/Catalog|Каталог/, async (msg) => {
    const chatId = msg.chat.id;
    const lang = userLanguages[chatId] || "uz";

    const catalogs = await getCatalogsFromSheets();

    

    let keyboard = catalogs.map(catalog => [{ text: catalog.name, callback_data: `catalog_${catalog.name}` }]);

    bot.sendMessage(chatId, lang === "uz" ? '📁 Kataloglar:' : '📁 Каталоги:', {
        reply_markup: {
            inline_keyboard: keyboard
        }
    });
});

// **3️⃣ PDF faylni yuborish**
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data.replace('catalog_', ''); // catalog_ prefix'ini olib tashlash

    const catalogs = await getCatalogsFromSheets();
    const selectedCatalog = catalogs.find(c => c.name === data);

    if (selectedCatalog) {
        bot.sendDocument(chatId, selectedCatalog.url, {
            caption: userLanguages[chatId] === "uz"
                ? `📄 ${selectedCatalog.name} katalogi`
                : `📄 Каталог ${selectedCatalog.name}`
        });
    } 
});


// Brendlar va Ijtimoiy tarmoqlar tugmalari
bot.onText(/Brendlar|Бренды/, (msg) => {
    const chatId = msg.chat.id;
    const lang = userLanguages[chatId] || "uz"; // Foydalanuvchi tanlagan tilni tekshirish

    bot.sendMessage(chatId, lang === "uz" ? '📌 Bizning partnyorlar:' : '📌 Наши партнёры:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Brend', url: 'https://yourwebsite.com' }],
                [{ text: 'Brend', url: 'https://yourwebsite.com' }]
            ]
        }
    });
});

bot.onText(/Ijtimoiy tarmoqlar|Социальные сети/, (msg) => {
    const chatId = msg.chat.id;
    const lang = userLanguages[chatId] || "uz"; // Tilni olish

    bot.sendMessage(chatId, lang === "uz" ? '📌 Bizning ijtimoiy tarmoqlar:' : '📌 Наши социальные сети:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Telegram', url: 'https://t.me/yourchannel' }, { text: 'Instagram', url: 'https://instagram.com/yourpage' }],
                [{ text: 'Facebook', url: 'https://facebook.com/yourpage' }, { text: 'Website', url: 'https://yourwebsite.com' }]
            ]
        }
    });
});

// Mahsulotni izlash funksiyasi
async function searchProductByCode(chatId, code) {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet1!A2:G',
    });
    const rows = res.data.values;
    if (!rows || rows.length === 0) {
        bot.sendMessage(chatId, userLanguages[chatId] === "uz" ? "📌 Mahsulot topilmadi." : "📌 Товар не найден.");
        return;
    }
    
    const products = rows.filter(row => row[6]?.trim() === code.trim());
    if (products.length === 0) {
        bot.sendMessage(chatId, userLanguages[chatId] === "uz" ? "📌 Mahsulot topilmadi." : "📌 Товар не найден.");
        return;
    }

    for (const product of products) {
        const lang = userLanguages[chatId] || "uz";
        const productData = {
            model: product[1]?.trim() || "Noma'lum",
            price: product[2]?.trim() || "Noma'lum",
            quantity: product[3]?.trim() || "0",
            imageUrls: product[4] ? product[4].split(',').map(url => url.trim()) : [],
        };

        let message = lang === "uz" 
            ? `📌 Model: ${productData.model}\n💰 Narxi: ${productData.price} USD\n📦 Mavjudligi: ${productData.quantity > 5 ? "5+" : productData.quantity} dona`
            : `📌 Модель: ${productData.model}\n💰 Цена: ${productData.price} USD\n📦 В наличии: ${productData.quantity > 5 ? "5+" : productData.quantity} шт`;

        if (productData.imageUrls.length > 0) {
            let mediaGroup = productData.imageUrls.map((imageUrl, imgIndex) => ({
                type: 'photo',
                media: imageUrl,
                caption: imgIndex === 0 ? message : ''
            }));
            await bot.sendMediaGroup(chatId, mediaGroup);
        } else {
            await bot.sendMessage(chatId, message);
        }
    }

    // **Mahsulotlar tugaganidan keyin chiqariladigan xabar va tugmalar**
    const lang = userLanguages[chatId] || "uz";
    const followUpMessage = lang === "uz" 
        ? "🔎 Yangi mahsulotni izlash yoki boshqa bo‘limni tanlang:" 
        : "🔎 Найдите новый товар или выберите другой раздел:";

        let keyboard = lang === "uz" 
        ? [
            [{ text: "Sotuvdagi mahsulotlar" }, { text: "Brak mahsulotlar" }],
            [{ text: "Brendlar" }, { text: "Ijtimoiy tarmoqlar" }],
            [{ text: "Catalog" }, { text: "🔍 Mahsulotni izlash" }],
            [{ text: "🌍 Tilni o‘zgartirish" }]
        ]
        : [
            [{ text: "Товары в продаже" }, { text: "Бракованные товары" }],
            [{ text: "Бренды" }, { text: "Социальные сети" }],
            [{ text: "Каталог" }, { text: "🔍 Поиск товара" }],
            [{ text: "🌍 Изменить язык" }]
        ];

    await bot.sendMessage(chatId, followUpMessage, {
        reply_markup: {
            keyboard: keyboard,
            resize_keyboard: true
        }
    });
}



// Har bir foydalanuvchi uchun mahsulot kodini kiritish jarayonini tekshirish
const userSearchState = {};

// 🔍 Mahsulotni izlash tugmasi bosilganda mahsulot kodini so‘rash
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text.trim();
    
    if (text === "🔍 Mahsulotni izlash" || text === "🔍 Поиск товара") {
        userSearchState[chatId] = true; // Foydalanuvchini kod kiritish rejimiga o‘tkazish
        bot.sendMessage(chatId, userLanguages[chatId] === "uz" 
            ? "📌 Mahsulot kodini kiriting:" 
            : "📌 Введите код товара:");
    } else if (userSearchState[chatId] && /^[A-Za-z0-9\-_\.]+$/.test(text)) { 
        searchProductByCode(chatId, text);
        userSearchState[chatId] = false; // Qidiruvni yakunlash
    }
});




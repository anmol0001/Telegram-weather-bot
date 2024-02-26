const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const axios = require('axios');
const schedule = require('node-schedule');
const User = require('./models/User')
const { OpenAI } = require('openai')
require('dotenv').config();

//Initialise MongoDB connection
mongoose.connect(process.env.MONGO_URL)      //Here Use your mongoDb Url.
    .then(() => console.log('DB Connected'))
    .catch((err) => console.log(err));

//configure open ai api
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY           //Your open ai api key. 
})

// Initialize Telegram Bot
const botToken = process.env.BOT_TOKEN;           //Use Bot Token which is get after creating.
const bot = new TelegramBot(botToken, { polling: true });

bot.on('message', async (msg) => {
    try {
        const chatId = msg.chat.id;
        const text = msg.text?.toString()?.toLowerCase() ?? "Some error in parsing";

        let user = await User.findOne({ chatId });

        if (text === '/start' || text === '/weather' || user?.chat_type === '/weatherinfo') {
            handleWeatherInfo(msg)
        }
        else if (text === '/newlocation' && user) {
            await User.findByIdAndUpdate({ _id: user._id }, { city: '', country: '' })
            handleWeatherInfo(msg)
        }
        else if (text === '/newlocation' && !user) {
            bot.sendMessage(chatId, "👋 New here? Share some info to get started!");
            handleWeatherInfo(msg)
        }
        else if (text === '/daily' && user && user.chat_type !== '/gptai') {
            await User.findByIdAndUpdate({ _id: user._id }, { last_text: text })
            forecastWeatherDaily(msg)
        }
        else if (text === '/daily' && (!user || user.chat_type === '/gptai')) {
            bot.sendMessage(chatId, "👋 New here? Share some info to get started! Once done, click /daily in the menu!");
            handleWeatherInfo(msg)
        }
        else {

            if (!user) {
                user = await User.create({
                    chatId: chatId,
                    chat_type: '/gptai',
                    username: msg.chat.first_name,
                    last_text: text
                });
            }
            else
                await User.findByIdAndUpdate({ _id: user._id }, { last_text: text, chat_type: msg.chat?.type })

            const res = await openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: text }],
                max_tokens: 50,
                temperature: 0.9,
            })

            console.log(res.choices[0].message.content)
            const finalRes = res.choices[0].message.content
            bot.sendMessage(chatId, finalRes);
        }

    } catch (error) {
        console.log(error)
        bot.sendMessage(msg.chat.id, "Sorry, There is some issue. We'll get back to you soon. 😊");
    }

});

//handle weather giving info flow
const handleWeatherInfo = async (msg) => {
    try {
        const chatId = msg.chat.id;
        const text = msg.text?.toString()?.toLowerCase() ?? "Some error in parsing";
        // const username =  msg.chat.first_name  //if wants by telegram username then use this...

        let user = await User.findOne({ chatId });

        if (!user || user.chat_type === '/gptai') {
            if (!user) {
                user = await User.create({
                    chatId: chatId,
                    last_text: text,
                    chat_type: '/weatherinfo'
                });
            }
            else
                await User.findByIdAndUpdate({ _id: user._id }, { username: '', last_text: text, chat_type: '/weatherinfo' })

            bot.sendMessage(chatId, "Hi there! 🌟 What's your name?");
            return;
        }
        else {
            if (!user.username) {
                await User.findByIdAndUpdate({ _id: user._id }, { username: text, last_text: text, chat_type: '/weatherinfo' })
                bot.sendMessage(chatId, "Nice to meet you, " + text + "! 😊 What city are you from?");
            } else if (user.username && text === '/newlocation') {
                await User.findByIdAndUpdate({ _id: user._id }, { last_text: text, chat_type: '/weatherinfo' })
                bot.sendMessage(chatId, "Hi! Again," + user.username + "! 😊 So tell me new city?");
            }
            else if (!user.city) {
                await User.findByIdAndUpdate({ _id: user._id }, { city: text, last_text: text, chat_type: '/weatherinfo' })
                bot.sendMessage(chatId, "Got it. 🏙️ What country are you from?");
            } else if (!user.country) {
                await User.findByIdAndUpdate({ _id: user._id }, { country: text, last_text: text, chat_type: msg.chat?.type })
                bot.sendMessage(chatId, "Great! You're all set. 🎉");
                const weather = await getWeather(user.city?.trim(), text?.trim(), user._id);
                bot.sendMessage(user.chatId, "🌤️ Here's Your Today Weather Update: \n" + weather);
            }
            else {
                bot.sendMessage(chatId, "Welcome back! 😊 ");
                const weather = await getWeather(user.city?.trim(), user.country?.trim(), user._id);
                bot.sendMessage(user.chatId, "🌤️ Here's Your Today Weather Update: \n" + weather);
            }
            return;
        }

    } catch (error) {
        console.log(error)
        bot.sendMessage(msg.chat.id, "Daily Weather Update: 🌤️\n" + weather);
    }
}

// Schedule daily weather updates
const forecastWeatherDaily = async (msg) => {
    try {
        const job = schedule.scheduleJob(process.env.CRON_JOB, async () => {     //cron-job "15 8 * * *"
            const chatId = msg.chat.id
            let user = await User.findOne({ chatId });

            const weather = await getWeather(user.city.trim(), user.country.trim(), user._id);
            bot.sendMessage(user.chatId, "🌤️ Here's Your Today Weather Update: \n" + weather);

        });
        bot.sendMessage(msg.chat.id, "🌟 Your daily weather updates is activated! ✨");
        return
    } catch (error) {
        console.log(error)
        bot.sendMessage(msg.chat.id, "Sorry, There is some issue. We'll get back to you soon. 😊");
    }
}


// Function to fetch weather data
async function getWeather(city, country, id) {
    try {
        const apiKey = process.env.WEATHER_API_KEY;    //Use Your open weather map api key.
        const apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`;
        const response = await axios.get(apiUrl);
        const weatherData = response.data;
        return `🌎 Weather in ${city}, ${country}:\n 🌤️ ${weatherData.weather[0].description},\n 🌡️ Temperature: ${Math.round(weatherData.main.temp)}°C`;

    } catch (error) {
        console.error("Error fetching weather:", error);
        return "Sorry, couldn't fetch weather data. ❌";
    }
}






// bot.on('message', async (msg) => {
//     const chatId = msg.chat.id
//     const msgText = msg.text?.toString()?.toLowerCase()
//     msg.chat.first_name
//     msg.chat.type

//     console.log(msg)

//     bot.sendMessage(chatId, "Hi There!!");
// });



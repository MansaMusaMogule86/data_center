console.log("SERVER STARTING");

const express = require("express");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "..")));

// Caches configuration
const caches = {
    stocks: { data: null, timestamp: 0, ttl: 5 * 60 * 1000 },
    weather: { data: null, timestamp: 0, ttl: 10 * 60 * 1000 },
    signals: { data: null, timestamp: 0, ttl: 5 * 60 * 1000 },
    news: { data: null, timestamp: 0, ttl: 10 * 60 * 1000 }
};

// Chat history memory state (last 8 messages)
const chatMemory = [];

function addToChatHistory(role, content) {
    chatMemory.push({ role, content });
    if (chatMemory.length > 8) {
        chatMemory.shift();
    }
}

// Mock generator for stocks if API limit hit
function getMockStockPrice(symbol) {
    const baselines = {
        NVDA: { price: 125.4, change: 2.3, changePercent: "+1.87%" },
        MSFT: { price: 415.5, change: -1.2, changePercent: "-0.29%" },
        GOOG: { price: 172.8, change: 0.9, changePercent: "+0.52%" },
        AMZN: { price: 184.2, change: -0.4, changePercent: "-0.22%" },
        META: { price: 504.6, change: 5.7, changePercent: "+1.14%" }
    };
    const base = baselines[symbol];
    const pct = (Math.random() - 0.5) * 0.04; 
    const price = +(base.price * (1 + pct)).toFixed(2);
    const change = +(base.change + base.price * pct).toFixed(2);
    const changePercent = (change >= 0 ? "+" : "") + ((change / base.price) * 100).toFixed(2) + "%";
    return { price, change, changePercent };
}

// Fetch stock data from Alpha Vantage
async function fetchStocksFromAPI() {
    const symbols = ['NVDA','MSFT','GOOG','AMZN','META'];
    const results = {};
    for (const symbol of symbols) {
        try {
            if (!process.env.ALPHA_VANTAGE_API_KEY) {
                throw new Error("Missing Alpha Vantage key");
            }
            const res = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`);
            const data = await res.json();
            const quote = data["Global Quote"];
            if (quote && quote["05. price"]) {
                results[symbol] = {
                    price: parseFloat(quote["05. price"]),
                    change: parseFloat(quote["09. change"]),
                    changePercent: quote["10. change percent"]
                };
            } else {
                results[symbol] = getMockStockPrice(symbol);
            }
        } catch (err) {
            results[symbol] = getMockStockPrice(symbol);
        }
    }
    return results;
}

// Mock generator for weather if API fails
function getMockWeather(location) {
    const data = {
        Dubai: { temp: 42, condition: "Sunny", humidity: 28, wind: 4.1 },
        Virginia: { temp: 24, condition: "Clear", humidity: 55, wind: 3.2 },
        Frankfurt: { temp: 19, condition: "Cloudy", humidity: 62, wind: 5.5 },
        Singapore: { temp: 31, condition: "Rain", humidity: 82, wind: 2.1 }
    };
    const base = data[location];
    const diff = Math.round((Math.random() - 0.5) * 4);
    return {
        temp: base.temp + diff,
        condition: base.condition,
        humidity: Math.min(100, Math.max(10, base.humidity + Math.round((Math.random() - 0.5) * 10))),
        wind: +(base.wind + (Math.random() - 0.5) * 2).toFixed(1)
    };
}

// Fetch weather data from OpenWeather API
async function fetchWeatherFromAPI() {
    const locations = {
        Dubai: 'Dubai,AE',
        Virginia: 'Ashburn,US',
        Frankfurt: 'Frankfurt,DE',
        Singapore: 'Singapore,SG'
    };
    const results = {};
    for (const [key, q] of Object.entries(locations)) {
        try {
            if (!process.env.OPENWEATHER_API_KEY) {
                throw new Error("Missing OpenWeather key");
            }
            const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${q}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`);
            if (!res.ok) throw new Error("API call error");
            const data = await res.json();
            results[key] = {
                temp: Math.round(data.main.temp),
                condition: data.weather[0].main,
                humidity: data.main.humidity,
                wind: data.wind.speed
            };
        } catch (err) {
            results[key] = getMockWeather(key);
        }
    }
    return results;
}

// Fetch news data
const curatedNews = [
    {
        headline: "Microsoft Plans Historic Clean Energy PPA for Three Mile Island Restart",
        source: "Reuters",
        time: "10m ago",
        category: "Nuclear Power",
        riskTag: "Medium Risk"
    },
    {
        headline: "NVIDIA Unveils Liquid-Cooled 'Rubin' GPU Architecture to Tackle Thermal Density Concerns",
        source: "TechCrunch",
        time: "45m ago",
        category: "Semiconductors",
        riskTag: "Optimal"
    },
    {
        headline: "OpenAI Negotiates Multi-Billion Dollar Compute Deal for 100k GPU Texas Stargate Cluster",
        source: "Bloomberg",
        time: "2h ago",
        category: "AI Infrastructure",
        riskTag: "High Risk"
    },
    {
        headline: "Loudoun County Enacts Emergency Water Surcharge for Data Center Evaporative Cooling",
        source: "Virginia Pilot",
        time: "4h ago",
        category: "Water Pressure",
        riskTag: "Critical"
    },
    {
        headline: "PJM Interconnection Warns Grid Upgrades Face 5-Year Backlog Amid Unprecedented Load Growth",
        source: "Wall Street Journal",
        time: "6h ago",
        category: "Power Grid",
        riskTag: "High Risk"
    }
];

async function fetchNewsFromAPI() {
    return curatedNews;
}

// Fetch signals data
async function fetchSignalsFromAPI() {
    return {
        gridLoad: {
            virginia: "92% (CRITICAL)",
            dubai: "58% (OPTIMAL)",
            frankfurt: "84% (HIGH)",
            singapore: "79% (STABLE)"
        },
        carbonIntensity: {
            virginia: "392 g/kWh",
            dubai: "485 g/kWh",
            frankfurt: "210 g/kWh",
            singapore: "340 g/kWh",
            sweden: "12 g/kWh (GREEN)"
        },
        pueAverage: {
            fleet: "1.14",
            optimal: "1.08 (Dublin)",
            legacy: "1.45 (Tokyo)"
        },
        alerts: [
            { id: 1, type: "CRITICAL", title: "PJM Interconnection power constraint alerts issued for Loudoun Co.", time: "12m ago" },
            { id: 2, type: "INFO", title: "Microsoft Fairwater Atlanta campus green PPA online (200 MW solar)", time: "1h ago" },
            { id: 3, type: "WARNING", title: "Memphis community gas turbine opposition files federal injunction", time: "3h ago" },
            { id: 4, type: "SUCCESS", title: "Constellation Energy confirms Three Mile Island reactor restart design approval", time: "5h ago" }
        ]
    };
}

// Cache helper
async function getCachedData(cacheKey, fetchFn) {
    const now = Date.now();
    const cache = caches[cacheKey];
    if (cache.data && (now - cache.timestamp < cache.ttl)) {
        return cache.data;
    }
    const data = await fetchFn();
    cache.data = data;
    cache.timestamp = now;
    return data;
}

// POST /api/chat - AI assistant with memory & specialized system prompt
app.post("/api/chat", async (req, res) => {
    try {
        const userMsg = req.body.message;
        if (!userMsg) {
            return res.status(400).json({ reply: "Message is required" });
        }

        const messages = [
            {
                role: "system",
                content: `You are NEXUS, a planetary data center infrastructure intelligence analyst. You are the command-center intelligence engine, speaking directly to high-level investors, architects, and decision-makers.

Core Traits & Identity:
- Focus exclusively on: infrastructure buildouts, hyperscale data center expansions, power grid limits, semiconductor supply chains (especially NVIDIA compute networks), water footprint conflicts, nuclear power agreements (behind-the-meter nuclear PPAs), sovereign AI clusters (like China's Inner Mongolia), and geopolitical flashpoints (such as Dubai's MENA hub expansion vs. US grid congestion).
- Do not sound like Wikipedia. Never list generic definitions. Never give platitudes or motivational fluff.
- Explain WHY everything matters. Detail the capital flow, physical limitations, and grid-level risks behind every trend.
- Be highly analytical, precise, and authoritative. Speak like a senior analyst briefing an intelligence agency.
- Answer user queries directly, contextualizing them within global energy, computing power, and economic constraints.`
            }
        ];

        chatMemory.forEach(msg => messages.push(msg));
        messages.push({ role: "user", content: userMsg });

        const response = await fetch(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "google/gemini-2.5-flash",
                    temperature: 0.7,
                    max_tokens: 800,
                    messages: messages
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error("OpenRouter error:", data);
            return res.status(500).json({
                reply: data.error?.message || "OpenRouter communication failure"
            });
        }

        const replyText = data.choices?.[0]?.message?.content || "No response generated";

        addToChatHistory("user", userMsg);
        addToChatHistory("assistant", replyText);

        res.json({ reply: replyText });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            reply: "NEXUS connectivity disrupted. Please retry."
        });
    }
});

// GET /api/stocks - Cached stock prices
app.get('/api/stocks', async (req, res) => {
    try {
        const data = await getCachedData("stocks", fetchStocksFromAPI);
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to get stock quotes" });
    }
});

// GET /api/weather - Cached weather data
app.get('/api/weather', async (req, res) => {
    try {
        const data = await getCachedData("weather", fetchWeatherFromAPI);
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to get weather data" });
    }
});

// GET /api/signals - Combined signals (Cached)
app.get("/api/signals", async (req, res) => {
    try {
        const data = await getCachedData("signals", fetchSignalsFromAPI);
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to get infrastructure signals" });
    }
});

// GET /api/news - Live AI Infrastructure News
app.get("/api/news", async (req, res) => {
    try {
        const data = await getCachedData("news", fetchNewsFromAPI);
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to get infrastructure news" });
    }
});

// POST /api/report - Dynamic Markdown Intelligence Report
app.post("/api/report", async (req, res) => {
    try {
        const stocks = await getCachedData("stocks", fetchStocksFromAPI);
        const weather = await getCachedData("weather", fetchWeatherFromAPI);
        const signals = await getCachedData("signals", fetchSignalsFromAPI);
        
        const systemPrompt = `You are NEXUS, the planetary data center intelligence system. Generate a highly detailed, professional Executive Intelligence Report on the global data center expansion.
The report must contain the following sections exactly:
1. EXECUTIVE SUMMARY
2. CRITICAL INFRASTRUCTURE RISKS
3. POWER GRID ANALYSIS
4. WATER AND COOLING PRESSURE
5. HYPERSCALER MOVES
6. MARKET SIGNALS
7. GEOPOLITICAL IMPLICATIONS
8. REGIONAL WINNERS
9. REGIONAL LOSERS
10. STRATEGIC RECOMMENDATIONS

Do not use conversational filler. Provide only clean, structured, authoritative content. Format the response in clear Markdown with bold titles, bullet points, and data tables where appropriate.`;

        const userPrompt = `Generate the intelligence report for June 2026.
Current Stock Market Signals:
- NVIDIA (NVDA): $${stocks.NVDA.price} (${stocks.NVDA.changePercent})
- Microsoft (MSFT): $${stocks.MSFT.price} (${stocks.MSFT.changePercent})
- Google (GOOG): $${stocks.GOOG.price} (${stocks.GOOG.changePercent})
- Amazon (AMZN): $${stocks.AMZN.price} (${stocks.AMZN.changePercent})
- Meta (META): $${stocks.META.price} (${stocks.META.changePercent})

Current Hot Hub Weather Signals:
- Dubai: ${weather.Dubai.temp}°C (${weather.Dubai.condition})
- Virginia (Ashburn): ${weather.Virginia.temp}°C (${weather.Virginia.condition})
- Frankfurt: ${weather.Frankfurt.temp}°C (${weather.Frankfurt.condition})
- Singapore: ${weather.Singapore.temp}°C (${weather.Singapore.condition})

Current Infrastructure Telemetry:
- Grid Load: Virginia (${signals.gridLoad.virginia}), Dubai (${signals.gridLoad.dubai}), Frankfurt (${signals.gridLoad.frankfurt}), Singapore (${signals.gridLoad.singapore})
- Carbon Intensity: Virginia (${signals.carbonIntensity.virginia}), Dubai (${signals.carbonIntensity.dubai}), Frankfurt (${signals.carbonIntensity.frankfurt}), Singapore (${signals.carbonIntensity.singapore}), Sweden (${signals.carbonIntensity.sweden})
- PUE Average: Fleet (${signals.pueAverage.fleet}), Optimal (${signals.pueAverage.optimal}), Legacy (${signals.pueAverage.legacy})
- Recent System Alerts: ${signals.alerts.map(a => `[${a.type}] ${a.title} (${a.time})`).join('; ')}
`;

        const response = await fetch(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "google/gemini-2.5-flash",
                    temperature: 0.4,
                    max_tokens: 1500,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt }
                    ]
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error("OpenRouter report generation failed:", data);
            return res.status(500).json({ error: "Failed to generate report" });
        }

        const reportText = data.choices?.[0]?.message?.content || "Report generation failed.";
        res.json({ report: reportText });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error during report generation" });
    }
});

if (process.env.NODE_ENV !== "production") {
    app.listen(3000, () => {
        console.log("Server running on http://localhost:3000");
    });
}

module.exports = app;

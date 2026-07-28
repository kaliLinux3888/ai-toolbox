/**
 * AI智能工具�? - 一体化服务 (前端静�? + 后端API代理)
 * 
 * 支持: Groq / OpenRouter / Google Gemini
 * 前端 ←→ 本服�?(代理) ←→ 免费AI API
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;

// =============================================
// 中间�?
// =============================================
app.use(cors({ origin: true, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-API-Key', 'X-Provider'] }));
app.use(express.json({ limit: '1mb' }));

// =============================================
// 静态文件服�? (前端)
// =============================================
const frontendPath = path.resolve(__dirname, '..');
app.use(express.static(frontendPath));

// =============================================
// 提供商配�?
// =============================================
const PROVIDERS = {
    github: {
        name: 'GitHub Models',
        baseUrl: 'https://models.inference.ai.azure.com/chat/completions',
        defaultModel: 'gpt-4.1',
        docs: 'https://github.com/settings/tokens'
    },
    chatanywhere: {
        name: 'ChatAnywhere',
        baseUrl: 'https://api.chatanywhere.tech/v1/chat/completions',
        defaultModel: 'gpt-5.5',
        docs: 'https://chatanywhere.tech'
    },
    groq: {
        name: 'Groq',
        baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
        defaultModel: 'llama-3.3-70b-versatile',
        docs: 'https://console.groq.com/keys'
    },
    openrouter: {
        name: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
        defaultModel: 'google/gemini-2.0-flash-exp:free',
        docs: 'https://openrouter.ai/keys'
    },
    gemini: {
        name: 'Google Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        defaultModel: 'gemini-2.0-flash',
        docs: 'https://aistudio.google.com/apikey'
    }
};

// =============================================
// 健康检�?
// =============================================
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString(), providers: Object.keys(PROVIDERS) });
});

// =============================================
// 获取提供商列�?
// =============================================
app.get('/api/providers', (req, res) => {
    const list = {};
    for (const [key, val] of Object.entries(PROVIDERS)) {
        list[key] = { name: val.name, defaultModel: val.defaultModel, docs: val.docs };
    }
    res.json(list);
});

// =============================================
// 获取推荐配置 (预填GitHub Token)
// =============================================
app.get('/api/config', (req, res) => {
    // 优先用环境变量，否则尝试 gh auth token
    let defaultToken = process.env.GITHUB_TOKEN || '';
    if (!defaultToken) {
        try {
            const { execSync } = require('child_process');
            defaultToken = execSync('gh auth token 2>/dev/null', { timeout: 3000, encoding: 'utf8' }).trim();
        } catch (e) {
            // gh 不可用或未登�?
        }
    }
    res.json({
        provider: 'github',
        model: 'gpt-4.1',
        apiKey: defaultToken,
        hint: '�? 已预配置 GitHub Models，默认使用最新的 GPT-4.1 模型'
    });
});

// =============================================
// 聊天接口 (核心)
// =============================================
app.post('/api/chat', async (req, res) => {
    try {
        const { message, history = [], apiKey, provider = 'groq', model } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ error: '消息不能为空' });
        }
        if (!apiKey) {
            return res.status(400).json({
                error: '请先配置 API Key',
                hint: '这是免费服务，无需信用卡，详见设置页面'
            });
        }

        const providerConfig = PROVIDERS[provider];
        if (!providerConfig) {
            return res.status(400).json({ error: `不支持的提供�?: ${provider}` });
        }

        // 构建消息
        const messages = [
            {
                role: 'system',
                content: `你是一个有用的AI助手，名�?"AI智能助手"。请用中文回复。回复要简洁清晰、友好热情，适当使用emoji�?

当前时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
            }
        ];

        const recentHistory = (history || []).slice(-10);
        for (const msg of recentHistory) {
            messages.push({ role: msg.role, content: msg.content });
        }
        messages.push({ role: 'user', content: message });

        // ---------- GitHub Models / Groq / OpenRouter (OpenAI兼容) ----------
        if (provider === 'github' || provider === 'groq' || provider === 'openrouter') {
            const selectedModel = model || providerConfig.defaultModel;
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            };

            if (provider === 'openrouter') {
                headers['HTTP-Referer'] = 'https://ai-tools.local';
                headers['X-Title'] = 'AI智能工具�?';
            }

            // o1 / o3 系列推理模型需要特殊处�?
            const isReasoningModel = /^o[13]/.test(selectedModel);
            const requestBody = {
                model: selectedModel,
                messages: isReasoningModel ? messages.filter(m => m.role !== 'system') : messages,
                stream: false
            };
            if (isReasoningModel) {
                requestBody.max_completion_tokens = 8192;
            } else {
                requestBody.max_tokens = 4096;
                requestBody.temperature = 0.7;
            }

            const response = await fetch(providerConfig.baseUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[${provider}] 错误 ${response.status}:`, errorText.slice(0, 300));

                if (response.status === 401) {
                    return res.status(401).json({ error: 'API Key 无效，请检查后重试', hint: `前往 ${providerConfig.docs} 获取有效 Key` });
                }
                if (response.status === 403) {
                    return res.status(403).json({
                        error: '权限不足，可能原因：API Key未启用访问该模型的权�?',
                        hint: provider === 'github'
                            ? '请到 https://github.com/marketplace/models 申请对应模型的访问权�?'
                            : `请检�? ${providerConfig.docs} 上的 Key 设置`
                    });
                }
                if (response.status === 429) {
                    return res.status(429).json({ error: '请求过于频繁，请稍后再试（免费API有频率限制）' });
                }
                if (response.status === 404 && provider === 'github') {
                    return res.status(404).json({
                        error: `模型 ${selectedModel} 不存在或暂未对你开放`,
                        hint: '请到 GitHub Models 市场确认可用模型列表'
                    });
                }
                return res.status(response.status).json({ error: `API 请求失败: ${response.status}` });
            }

            const data = await response.json();
            const reply = data.choices?.[0]?.message?.content || '抱歉，我没有理解你的问题�?';

            return res.json({ reply, model: data.model || selectedModel, provider: providerConfig.name });
        }

        // ---------- Google Gemini ----------
        if (provider === 'gemini') {
            const url = `${providerConfig.baseUrl}?key=${apiKey}`;
            const contents = [];
            for (const msg of messages) {
                if (msg.role === 'system') continue;
                contents.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts: [{ text: msg.content }] });
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents,
                    systemInstruction: { parts: [{ text: '你是一个有用的AI助手，请用中文回复�?' }] },
                    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                return res.status(response.status).json({ error: `Gemini 错误: ${response.status}` });
            }

            const data = await response.json();
            const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '抱歉，我没有理解你的问题�?';
            return res.json({ reply, model: 'gemini-2.0-flash', provider: 'Google Gemini' });
        }

        return res.status(400).json({ error: `不支持的提供�?: ${provider}` });

    } catch (err) {
        console.error('[Server] 错误:', err.message);
        return res.status(500).json({ error: '服务器内部错误，请稍后重�?' });
    }
});

// =============================================
// SPA fallback: 所有非API路径返回 index.html
// =============================================
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API 端点不存�?' });
    }
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// =============================================
// 启动
// =============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`�? AI工具箱服务启动成功`);
    console.log(`   http://0.0.0.0:${PORT}`);
    console.log(`   支持: ${Object.keys(PROVIDERS).join(', ')}`);
});

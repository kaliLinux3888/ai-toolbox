/**
 * AI智能工具箱 - 一体化服务（前端静态 + 后端API代理）
 *
 * 支持: GitHub Models / ChatAnywhere / OpenRouter / Groq / Google Gemini
 * 前端 → 本服务(代理) → 免费AI API
 *
 * 注：GitHub Pages 等纯静态托管无法运行此后端，前端会改用 Puter.js 免费直连。
 * 本后端用于本地或自托管场景，并支持 SSE 流式输出。
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;

// =============================================
// 中间件
// =============================================
app.use(cors({ origin: true, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-API-Key', 'X-Provider'] }));
app.use(express.json({ limit: '2mb' }));

// =============================================
// 静态文件服务（前端）
// =============================================
const frontendPath = path.resolve(__dirname, '..');
app.use(express.static(frontendPath));

// =============================================
// 服务商配置
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
        defaultModel: 'gpt-4.1',
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
        defaultModel: 'openai/gpt-4.1-mini',
        docs: 'https://openrouter.ai/keys'
    },
    gemini: {
        name: 'Google Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        defaultModel: 'gemini-2.0-flash',
        docs: 'https://aistudio.google.com/apikey'
    }
};

const SYSTEM_PROMPT = `你是一个聪明、可靠、乐于助人的中文 AI 助手，名字叫「AI智能助手」。
回答准确、有条理，默认使用中文。复杂问题用分点、表格或代码块呈现。语气友好自然。`;

// =============================================
// 健康检查
// =============================================
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString(), providers: Object.keys(PROVIDERS) });
});

// =============================================
// 获取推荐配置（预填 GitHub Token）
// =============================================
app.get('/api/config', (req, res) => {
    let defaultToken = process.env.GITHUB_TOKEN || '';
    if (!defaultToken) {
        try {
            const { execSync } = require('child_process');
            defaultToken = execSync('gh auth token 2>/dev/null', { timeout: 3000, encoding: 'utf8' }).trim();
        } catch (e) { /* gh 不可用或未登录 */ }
    }
    res.json({
        provider: 'github',
        model: 'gpt-4.1',
        apiKey: defaultToken,
        hint: '已预配置 GitHub Models，默认使用最新的 GPT-4.1 模型'
    });
});

// =============================================
// 聊天接口（核心）：支持 SSE 流式 (stream:true)
// =============================================
app.post('/api/chat', async (req, res) => {
    try {
        const { message, history = [], apiKey, provider = 'groq', model, stream = false } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ error: '消息不能为空' });
        }
        if (!apiKey) {
            return res.status(400).json({ error: '请先配置 API Key', hint: '这是免费服务，无需信用卡，详见设置面板' });
        }

        const providerConfig = PROVIDERS[provider];
        if (!providerConfig) {
            return res.status(400).json({ error: `不支持的服务商: ${provider}` });
        }

        // 构建消息
        const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
        const recentHistory = (history || []).slice(-10);
        for (const msg of recentHistory) {
            messages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content });
        }
        messages.push({ role: 'user', content: message });

        const selectedModel = model || providerConfig.defaultModel;
        const isReasoningModel = /^o[13]/.test(selectedModel);

        // ---------- Google Gemini ----------
        if (provider === 'gemini') {
            const url = `${providerConfig.baseUrl}?key=${apiKey}`;
            const contents = [];
            for (const msg of messages) {
                if (msg.role === 'system') continue;
                contents.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts: [{ text: msg.content }] });
            }
            const upstream = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents,
                    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
                })
            });
            if (!upstream.ok) {
                const err = await upstream.text();
                return res.status(upstream.status).json({ error: `Gemini 错误: ${upstream.status}` });
            }
            const data = await upstream.json();
            const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '抱歉，我没有理解你的问题。';
            if (stream) {
                return streamText(res, reply, selectedModel, providerConfig.name);
            }
            return res.json({ reply, model: 'gemini-2.0-flash', provider: 'Google Gemini' });
        }

        // ---------- OpenAI 兼容：GitHub / Groq / OpenRouter / ChatAnywhere ----------
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
        if (provider === 'openrouter') {
            headers['HTTP-Referer'] = 'https://ai-tools.local';
            headers['X-Title'] = 'AI智能工具箱';
        }

        const requestBody = {
            model: selectedModel,
            messages: isReasoningModel ? messages.filter(m => m.role !== 'system') : messages,
            stream: stream && !isReasoningModel
        };
        if (isReasoningModel) {
            requestBody.max_completion_tokens = 8192;
        } else {
            requestBody.max_tokens = 4096;
            requestBody.temperature = 0.7;
        }

        const upstream = await fetch(providerConfig.baseUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody)
        });

        if (!upstream.ok) {
            const errText = await upstream.text();
            console.error(`[${provider}] 错误 ${upstream.status}:`, errText.slice(0, 300));
            if (upstream.status === 401) return res.status(401).json({ error: 'API Key 无效，请检查后重试', hint: `前往 ${providerConfig.docs} 获取有效 Key` });
            if (upstream.status === 403) return res.status(403).json({ error: '权限不足，可能 API Key 未启用访问该模型的权限', hint: provider === 'github' ? '请到 https://github.com/marketplace/models 申请对应模型的访问权限' : `请检查 ${providerConfig.docs} 上的 Key 设置` });
            if (upstream.status === 429) return res.status(429).json({ error: '请求过于频繁，请稍后重试（免费 API 有频率限制）' });
            if (upstream.status === 404 && provider === 'github') return res.status(404).json({ error: `模型 ${selectedModel} 不存在或暂未对你开放`, hint: '请到 GitHub Models 市场确认可用模型列表' });
            return res.status(upstream.status).json({ error: `API 请求失败: ${upstream.status}` });
        }

        // 推理模型不支持流式 → 直接返回
        if (isReasoningModel || !stream) {
            const data = await upstream.json();
            const reply = data.choices?.[0]?.message?.content || '抱歉，我没有理解你的问题。';
            if (stream) return streamText(res, reply, selectedModel, providerConfig.name);
            return res.json({ reply, model: data.model || selectedModel, provider: providerConfig.name });
        }

        // SSE 流式转发
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });
        res.flushHeaders && res.flushHeaders();

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const send = (obj) => { res.write(`data: ${JSON.stringify(obj)}\n\n`); };

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) {
                    const t = line.trim();
                    if (!t.startsWith('data:')) continue;
                    const payload = t.slice(5).trim();
                    if (payload === '[DONE]') continue;
                    try {
                        const obj = JSON.parse(payload);
                        const token = obj.choices?.[0]?.delta?.content;
                        if (token) send({ token });
                    } catch (e) { /* 忽略非JSON行 */ }
                }
            }
        } catch (e) {
            send({ error: '流式传输中断' });
        } finally {
            send({ token: '' });
            res.write('data: [DONE]\n\n');
            res.end();
        }
    } catch (err) {
        console.error('[Server] 错误:', err.message);
        if (!res.headersSent) return res.status(500).json({ error: '服务器内部错误，请稍后重试' });
        try { res.end(); } catch (e) {}
    }
});

// 将整段文本作为单 token 流推送（用于不支持流式的模型/服务商）
function streamText(res, text, model, provider) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive'
    });
    res.flushHeaders && res.flushHeaders();
    // 分块推送，模拟流式
    const chunkSize = 12;
    for (let i = 0; i < text.length; i += chunkSize) {
        res.write(`data: ${JSON.stringify({ token: text.slice(i, i + chunkSize) })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
}

// =============================================
// SPA fallback：非 API 路径返回 index.html
// =============================================
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API 端点不存在' });
    }
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// =============================================
// 启动
// =============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`? AI工具箱服务启动成功`);
    console.log(`   http://0.0.0.0:${PORT}`);
    console.log(`   支持: ${Object.keys(PROVIDERS).join(', ')}`);
});

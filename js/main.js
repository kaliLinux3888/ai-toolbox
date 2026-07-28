/**
 * AI智能工具箱 - 主脚本
 * 聊天（ChatGPT 风格：流式输出 / Markdown / 侧边栏 / 模型选择器）
 * + 工具弹窗 + 主题 + 导航 + 动画
 */

'use strict';

// =============================================
// 0. Markdown / 高亮 初始化
// =============================================
if (typeof marked !== 'undefined') {
    marked.setOptions({ breaks: true, gfm: true });
}

// =============================================
// 1. DOM 引用
// =============================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const navbar = $('#navbar');
const navLinks = $('#navLinks');
const mobileBtn = $('#mobileMenuBtn');
const themeToggle = $('#themeToggle');
const backToTop = $('#backToTop');

// 聊天（ChatGPT 风格）
const chatApp = $('#chatApp');
const chatSidebar = $('#chatSidebar');
const conversationList = $('#conversationList');
const newChatBtn = $('#newChatBtn');
const sidebarToggle = $('#sidebarToggle');
const mobileChatMenu = $('#mobileChatMenu');
const sidebarModelName = $('#sidebarModelName');
const chatMessages = $('#chatMessages');
const chatInput = $('#chatInput');
const sendBtn = $('#sendBtn');
const clearChat = $('#clearChat');
const suggestions = $$('.suggestion-chip');
const modelSelector = $('#modelSelector');
const modelSelectorBtn = $('#modelSelectorBtn');
const modelDropdown = $('#modelDropdown');
const currentModelName = $('#currentModelName');
const currentModelBadge = $('#currentModelBadge');

// 工具弹窗
const toolCards = $$('.tool-card');
const modal = $('#toolModal');
const modalClose = $('#modalClose');
const modalTitle = $('#modalTitle');
const modalContent = $('#modalContent');
const modalInput = $('#modalInput');
const modalInputLabel = $('#modalInputLabel');
const modalSubmit = $('#modalSubmit');
const modalResult = $('#modalResult');
const modalResultContent = $('#modalResultContent');
const copyResult = $('#copyResult');

// API 配置面板
const apiSettingsBtn = $('#apiSettingsBtn');
const apiConfigOverlay = $('#apiConfigOverlay');
const apiConfigClose = $('#apiConfigClose');
const providerSelect = $('#providerSelect');
const modelSelect = $('#modelSelect');
const apiKeyInput = $('#apiKeyInput');
const apiStatus = $('#apiStatus');
const configHint = $('#configHint');
const testConnectionBtn = $('#testConnectionBtn');
const saveConfigBtn = $('#saveConfigBtn');

// =============================================
// 2. 模型定义（免费直连 + 自定义API）
// =============================================
const MODEL_GROUPS = [
    {
        label: 'OpenAI · 免费用',
        models: [
            { id: 'gpt-5.5', name: 'GPT-5.5', desc: '最强推理与创作能力（推荐）', icon: 'fa-brain', badge: '推荐' },
            { id: 'gpt-5-nano', name: 'GPT-5 Nano', desc: '极速响应，默认模型', icon: 'fa-bolt', badge: '极速' },
            { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano', desc: '速度与质量均衡', icon: 'fa-star' },
            { id: 'gpt-5.3-chat', name: 'GPT-5.3 Chat', desc: '对话场景优化', icon: 'fa-comment' },
            { id: 'gpt-4.1', name: 'GPT-4.1', desc: '稳定可靠，长上下文', icon: 'fa-robot' },
            { id: 'gpt-4o', name: 'GPT-4o', desc: '支持多模态（图文）', icon: 'fa-eye' }
        ]
    },
    {
        label: '其他厂商 · 免费',
        models: [
            { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', desc: '长文写作与严谨推理', icon: 'fa-feather' },
            { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash', desc: 'Google 极速模型', icon: 'fa-gem' }
        ]
    },
    {
        label: '高级',
        models: [
            { id: '__custom__', name: '自定义 API（自托管）', desc: '使用你的 Key，经后端代理', icon: 'fa-key', badge: '高级' }
        ]
    }
];

const ALL_MODELS = MODEL_GROUPS.flatMap(g => g.models);
const getModel = (id) => ALL_MODELS.find(m => m.id === id) || ALL_MODELS[0];

// =============================================
// 3. 更聪明的系统提示词
// =============================================
function buildSystemPrompt() {
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    return `你是一个聪明、可靠、乐于助人的中文 AI 助手，名字叫「AI智能助手」。

你的回答原则：
- 准确、有条理，默认使用中文，必要时中英混用。
- 复杂问题用分点、表格或代码块呈现，提升可读性。
- 遇到不确定或可能变化的信息，坦诚说明，绝不编造。
- 语气友好自然，适当使用 emoji 增强表达。
- 用户要求写代码时，给出可直接运行的完整示例，并简要解释关键思路。
- 回答要真正解决用户的问题，而不是泛泛而谈。

当前时间：${now}`;
}

// =============================================
// 4. 状态管理
// =============================================
let apiConfig = loadConfig();
let chatSettings = loadChatSettings();

let conversations = loadConversations();   // [{id,title,messages:[{role,content}]}]
let activeId = conversations.length ? conversations[0].id : null;

let isGenerating = false;
let stopRequested = false;
let abortCtrl = null;

// =============================================
// 5. 本地持久化
// =============================================
function loadConfig() {
    try {
        const s = localStorage.getItem('ai_api_config');
        if (s) {
            const p = JSON.parse(s);
            return { provider: p.provider || 'github', model: p.model || 'gpt-4.1', apiKey: p.apiKey || '' };
        }
    } catch (e) {}
    return { provider: 'github', model: 'gpt-4.1', apiKey: '' };
}
function saveConfig() { localStorage.setItem('ai_api_config', JSON.stringify(apiConfig)); }

function loadChatSettings() {
    try {
        const s = localStorage.getItem('ai_chat_settings');
        if (s) {
            const p = JSON.parse(s);
            if (getModel(p.model)) return { model: p.model };
        }
    } catch (e) {}
    return { model: 'gpt-5.5' };
}
function saveChatSettings() { localStorage.setItem('ai_chat_settings', JSON.stringify(chatSettings)); }

function loadConversations() {
    try {
        const s = localStorage.getItem('ai_conversations');
        if (s) {
            const arr = JSON.parse(s);
            if (Array.isArray(arr)) return arr;
        }
    } catch (e) {}
    return [];
}
function saveConversations() { localStorage.setItem('ai_conversations', JSON.stringify(conversations)); }

// =============================================
// 6. 对话（侧边栏）管理
// =============================================
function genId() { return 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function getActiveConversation() { return conversations.find(c => c.id === activeId) || null; }

function createConversation() {
    const conv = { id: genId(), title: '新对话', messages: [] };
    conversations.unshift(conv);
    activeId = conv.id;
    saveConversations();
    renderConversationList();
    renderActiveConversation();
    return conv;
}

function ensureActiveConversation() {
    if (!getActiveConversation()) {
        if (conversations.length) { activeId = conversations[0].id; }
        else { createConversation(); }
    }
}

function deleteConversation(id, e) {
    e && e.stopPropagation();
    conversations = conversations.filter(c => c.id !== id);
    if (activeId === id) {
        activeId = conversations.length ? conversations[0].id : null;
        if (!activeId) createConversation();
        else renderActiveConversation();
    }
    saveConversations();
    renderConversationList();
}

function renderConversationList() {
    if (!conversations.length) {
        conversationList.innerHTML = '<div class="conv-empty">暂无对话历史<br>点击「新对话」开始</div>';
        return;
    }
    conversationList.innerHTML = conversations.map(c => {
        const title = c.title && c.title !== '新对话' ? c.title : '新对话';
        const active = c.id === activeId ? ' active' : '';
        return `<div class="conv-item${active}" data-id="${c.id}">
            <i class="fas fa-message" style="color:var(--text-tertiary);font-size:12px"></i>
            <span class="conv-title">${escapeHtml(title)}</span>
            <button class="conv-delete" data-id="${c.id}" title="删除"><i class="fas fa-trash"></i></button>
        </div>`;
    }).join('');

    conversationList.querySelectorAll('.conv-item').forEach(el => {
        el.addEventListener('click', () => {
            activeId = el.dataset.id;
            renderConversationList();
            renderActiveConversation();
            if (window.innerWidth <= 768) chatApp.classList.add('sidebar-collapsed');
        });
    });
    conversationList.querySelectorAll('.conv-delete').forEach(btn => {
        btn.addEventListener('click', (e) => deleteConversation(btn.dataset.id, e));
    });
}

function renderActiveConversation() {
    const conv = getActiveConversation();
    if (!conv || !conv.messages.length) {
        renderEmptyState();
        return;
    }
    chatMessages.innerHTML = '';
    conv.messages.forEach(m => {
        if (m.role === 'user') addUserMessageToUI(m.content);
        else addAssistantMessageToUI(m.content, true);
    });
    scrollToBottom();
}

function renderEmptyState() {
    const picks = [
        { icon: 'fa-pen', prompt: '帮我写一封求职自我介绍邮件' },
        { icon: 'fa-lightbulb', prompt: '给我 5 个短视频选题创意' },
        { icon: 'fa-code', prompt: '用 Python 写爬虫并解释思路' },
        { icon: 'fa-chart-line', prompt: '分析新手如何开始理财投资' }
    ];
    chatMessages.innerHTML = `
        <div class="chat-empty">
            <div class="empty-ico"><i class="fas fa-robot"></i></div>
            <h3>有什么可以帮你的？</h3>
            <p>我是 AI智能助手，基于 Puter.js 免费直连主流大模型，支持流式回答与 Markdown 渲染。试试下面的问题：</p>
            <div class="suggest-grid">
                ${picks.map(p => `<button class="suggestion-chip" data-prompt="${escapeHtml(p.prompt)}"><i class="fas ${p.icon}"></i> ${escapeHtml(p.prompt)}</button>`).join('')}
            </div>
        </div>`;
    bindSuggestionChips();
}

// =============================================
// 7. 消息渲染
// =============================================
function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text == null ? '' : String(text);
    return d.innerHTML;
}

function renderMarkdown(text) {
    try {
        return marked.parse(text || '');
    } catch (e) {
        return escapeHtml(text).replace(/\n/g, '<br>');
    }
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addUserMessageToUI(text) {
    removeEmptyState();
    const div = document.createElement('div');
    div.className = 'message message-user';
    const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `
        <div class="message-avatar"><i class="fas fa-user"></i></div>
        <div class="message-content">
            <div class="message-bubble">${escapeHtml(text)}</div>
            <span class="message-time">${time}</span>
        </div>`;
    chatMessages.appendChild(div);
    scrollToBottom();
}

// 渲染已完成（或历史）的助手消息
function addAssistantMessageToUI(text, final) {
    removeEmptyState();
    const div = document.createElement('div');
    div.className = 'message message-ai';
    const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `
        <div class="message-avatar"><i class="fas fa-robot"></i></div>
        <div class="message-content">
            <div class="message-bubble"><div class="md-content">${renderMarkdown(text)}</div></div>
            <span class="message-time">${time}</span>
        </div>`;
    chatMessages.appendChild(div);
    enhanceCodeBlocks(div);
    scrollToBottom();
    return div;
}

// 创建流式助手气泡，返回可更新的 DOM 引用
function createStreamingBubble() {
    removeEmptyState();
    const div = document.createElement('div');
    div.className = 'message message-ai';
    const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `
        <div class="message-avatar"><i class="fas fa-robot"></i></div>
        <div class="message-content">
            <div class="message-bubble">
                <div class="md-content"></div>
                <span class="stream-cursor"></span>
            </div>
            <span class="message-time">${time}</span>
        </div>`;
    chatMessages.appendChild(div);
    const md = div.querySelector('.md-content');
    const cursor = div.querySelector('.stream-cursor');
    return { wrapper: div, md, cursor };
}

function updateStreamingBubble(bubble, raw) {
    bubble.md.innerHTML = renderMarkdown(raw);
    // 保持光标在末尾
    bubble.md.after(bubble.cursor);
    enhanceCodeBlocks(bubble.wrapper);
    scrollToBottom();
}

function finalizeStreamingBubble(bubble, raw) {
    bubble.md.innerHTML = renderMarkdown(raw);
    if (bubble.cursor && bubble.cursor.parentNode) bubble.cursor.remove();
    enhanceCodeBlocks(bubble.wrapper);
    scrollToBottom();
}

function enhanceCodeBlocks(scope) {
    scope.querySelectorAll('pre').forEach(pre => {
        const code = pre.querySelector('code');
        if (!code) return;
        try { if (typeof hljs !== 'undefined') hljs.highlightElement(code); } catch (e) {}
        if (pre.previousElementSibling && pre.previousElementSibling.classList.contains('code-block-head')) return;
        const lang = (code.className.match(/language-([\w+-]+)/) || [, 'text'])[1] || 'text';
        const head = document.createElement('div');
        head.className = 'code-block-head';
        head.innerHTML = `<span class="lang">${escapeHtml(lang)}</span>`;
        const btn = document.createElement('button');
        btn.className = 'code-copy-btn';
        btn.innerHTML = '<i class="fas fa-copy"></i> 复制';
        btn.addEventListener('click', () => {
            navigator.clipboard.writeText(code.textContent).then(() => {
                btn.innerHTML = '<i class="fas fa-check"></i> 已复制';
                setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> 复制'; }, 1800);
            }).catch(() => {});
        });
        head.appendChild(btn);
        pre.parentNode.insertBefore(head, pre);
    });
}

// 需要登录 Puter 时，展示一个明确的一键登录卡片（而非晦涩报错）
function showAuthCard() {
    const div = document.createElement('div');
    div.className = 'message message-ai';
    div.innerHTML = `
        <div class="message-avatar"><i class="fas fa-robot"></i></div>
        <div class="message-content">
            <div class="message-bubble">
                <div class="auth-card">
                    <div class="auth-emoji">🔓</div>
                    <p>免费登录 <b>Puter</b> 即可使用 GPT-5.5（<b>无需信用卡</b>），这是免费 GPT 模型的唯一要求。</p>
                    <button class="auth-login-btn" id="puterLoginBtn"><i class="fas fa-user"></i> 一键登录 Puter（免费）</button>
                    <p class="auth-hint">登录一次后永久免费，刷新也保持登录。或点右上角钥匙配置自己的 API Key。</p>
                </div>
            </div>
        </div>`;
    chatMessages.appendChild(div);
    const btn = div.querySelector('#puterLoginBtn');
    const hint = div.querySelector('.auth-hint');
    btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在打开登录…';
        try {
            if (typeof puter === 'undefined' || !puter.auth) throw new Error('Puter 未加载');
            await puter.auth.signIn();
            div.remove();
            addAssistantMessageToUI('✅ 已登录 Puter！现在可以直接对话了，点下面的推荐或输入问题试试 👇', true);
            chatInput.focus();
        } catch (e) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-user"></i> 一键登录 Puter（免费）';
            hint.textContent = '登录未完成（可能被关闭）。请重试，或点右上角钥匙配置 API Key。';
        }
    });
    scrollToBottom();
}

function removeEmptyState() {
    const empty = chatMessages.querySelector('.chat-empty');
    if (empty) empty.remove();
}

function showErrorInBubble(bubble, msg) {
    if (bubble) {
        bubble.md.innerHTML = `<p style="color:#ef4444">⚠️ ${escapeHtml(msg)}</p>`;
        if (bubble.cursor && bubble.cursor.parentNode) bubble.cursor.remove();
    } else {
        addAssistantMessageToUI(`⚠️ ${msg}`, true);
    }
}

// =============================================
// 8. 发送消息（流式）
// =============================================
function buildPuterMessages(historyMessages) {
    return [
        { role: 'system', content: buildSystemPrompt() },
        ...historyMessages.map(m => ({ role: m.role, content: m.content }))
    ];
}

async function handleSendMessage() {
    const text = chatInput.value.trim();
    if (!text || isGenerating) return;

    ensureActiveConversation();
    const conv = getActiveConversation();

    addUserMessageToUI(text);
    conv.messages.push({ role: 'user', content: text });

    // 自动命名（取首条用户消息）
    if (conv.title === '新对话' || !conv.title) {
        conv.title = text.length > 18 ? text.slice(0, 18) + '…' : text;
        renderConversationList();
    }
    saveConversations();

    chatInput.value = '';
    autoResizeTextarea(chatInput);
    sendBtn.disabled = true;

    const bubble = createStreamingBubble();
    let raw = '';
    isGenerating = true;
    stopRequested = false;
    setStopUI(true);

    const model = chatSettings.model;

    try {
        let reply = '';
        if (model === '__custom__') {
            reply = await streamProxy(text, conv.messages.slice(0, -1), (full) => {
                raw = full; updateStreamingBubble(bubble, raw);
            });
        } else if (typeof puter !== 'undefined') {
            reply = await streamPuter(buildPuterMessages(conv.messages), model, (full) => {
                raw = full; updateStreamingBubble(bubble, raw);
            });
        } else {
            throw new Error('Puter.js 未加载，请检查网络或配置自定义 API');
        }

        if (stopRequested) {
            raw = raw || reply || '（已停止生成）';
        }
        finalizeStreamingBubble(bubble, raw || reply || '');
        conv.messages.push({ role: 'assistant', content: raw || reply || '' });
        saveConversations();
    } catch (err) {
        console.error('[chat] 错误:', err);
        const msg = err.message || '出错了，请稍后再试';
        if (/auth|login|sign in|未登录|not authenticated|unauthenticated|restricted/i.test(msg)) {
            // 需要登录：移除空气泡，改显示一键登录卡片
            if (bubble && bubble.wrapper && bubble.wrapper.parentNode) bubble.wrapper.remove();
            showAuthCard();
            return;
        } else if (/quota|limit|rate|429/i.test(msg)) {
            showErrorInBubble(bubble, '当前模型触发限流，换一个免费模型再试（如 GPT-5 Nano）。');
        } else if (/model/i.test(msg)) {
            // 模型不可用，回退到 gpt-5-nano
            try {
                chatSettings.model = 'gpt-5-nano';
                saveChatSettings();
                syncModelSelector();
                showErrorInBubble(bubble, `模型不可用，已自动切换到 GPT-5 Nano，请重新发送。`);
            } catch (e) { showErrorInBubble(bubble, msg); }
        } else {
            showErrorInBubble(bubble, msg);
        }
    } finally {
        isGenerating = false;
        setStopUI(false);
        sendBtn.disabled = false;
        chatInput.focus();
        scrollToBottom();
    }
}

// --- Puter.js 流式 ---
async function streamPuter(messages, model, onToken) {
    const resp = await puter.ai.chat(messages, { model, stream: true });
    let full = '';
    for await (const part of resp) {
        if (stopRequested) break;
        if (part && part.text) {
            full += part.text;
            onToken(full);
        }
    }
    return full;
}

// --- 后端代理 SSE 流式（自托管可用） ---
async function streamProxy(message, history, onToken) {
    if (!apiConfig.apiKey) {
        throw new Error('请先在右上角「钥匙」里配置 API Key（自定义 API 需要自托管后端）');
    }
    abortCtrl = new AbortController();
    const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortCtrl.signal,
        body: JSON.stringify({
            message,
            history,
            apiKey: apiConfig.apiKey,
            provider: apiConfig.provider,
            model: apiConfig.model,
            stream: true
        })
    });
    if (!res.ok) {
        let detail = '';
        try { const d = await res.json(); detail = d.error || ''; } catch (e) {}
        throw new Error(detail || `后端错误 HTTP ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
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
                if (obj.token) { full += obj.token; onToken(full); }
                if (obj.error) throw new Error(obj.error);
            } catch (e) { if (e.message && !/Unexpected|JSON/.test(e.message)) throw e; }
        }
    }
    return full;
}

function setStopUI(stopping) {
    if (stopping) {
        sendBtn.classList.add('stop');
        sendBtn.innerHTML = '<i class="fas fa-stop"></i>';
        sendBtn.disabled = false;
    } else {
        sendBtn.classList.remove('stop');
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
    }
}

// =============================================
// 9. 模型选择器
// =============================================
function renderModelDropdown() {
    let html = '';
    MODEL_GROUPS.forEach(group => {
        html += `<div class="model-group-label">${group.label}</div>`;
        group.models.forEach(m => {
            const active = m.id === chatSettings.model ? ' active' : '';
            const badge = m.badge ? `<span class="model-badge" style="margin-left:0">${m.badge}</span>` : '';
            html += `<div class="model-option${active}" data-model="${m.id}">
                <div class="m-ico"><i class="fas ${m.icon}"></i></div>
                <div class="m-info">
                    <div class="m-name">${m.name} ${badge}</div>
                    <div class="m-desc">${m.desc}</div>
                </div>
                <i class="fas fa-check m-check"></i>
            </div>`;
        });
    });
    modelDropdown.innerHTML = html;
    modelDropdown.querySelectorAll('.model-option').forEach(opt => {
        opt.addEventListener('click', () => {
            chatSettings.model = opt.dataset.model;
            saveChatSettings();
            syncModelSelector();
            closeModelDropdown();
        });
    });
}

function syncModelSelector() {
    const m = getModel(chatSettings.model);
    currentModelName.textContent = m.name;
    sidebarModelName.textContent = m.name;
    currentModelBadge.textContent = m.id === '__custom__' ? '自托管' : '免费';
    // 重新渲染高亮
    modelDropdown.querySelectorAll('.model-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.model === m.id);
    });
}

function openModelDropdown() { modelSelector.classList.add('open'); renderModelDropdown(); }
function closeModelDropdown() { modelSelector.classList.remove('open'); }

// =============================================
// 10. API 配置面板
// =============================================
const PROVIDER_CONFIGS = {
    github: {
        models: [
            { value: 'gpt-4.1', label: 'GPT-4.1 (最新)' },
            { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
            { value: 'gpt-4.1-nano', label: 'GPT-4.1 nano' },
            { value: 'gpt-4o', label: 'GPT-4o' },
            { value: 'gpt-4o-mini', label: 'GPT-4o mini' }
        ],
        hint: 'GitHub Models 免费，可在自托管后端使用'
    },
    chatanywhere: {
        models: [
            { value: 'gpt-5.5-ca', label: 'GPT-5.5 (付费)' },
            { value: 'gpt-5-ca', label: 'GPT-5 (免费5次/天)' },
            { value: 'gpt-4.1-ca', label: 'GPT-4.1 (免费100次/天)' },
            { value: 'gpt-4o-ca', label: 'GPT-4o (免费100次/天)' }
        ],
        hint: 'ChatAnywhere 注册送免费额度'
    },
    openrouter: {
        models: [
            { value: 'openai/gpt-5.5-pro', label: 'GPT-5.5 Pro' },
            { value: 'openai/gpt-5.5', label: 'GPT-5.5' }
        ],
        hint: 'OpenRouter GPT-5.5 需充值'
    },
    groq: {
        models: [
            { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
            { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B' }
        ],
        hint: 'Groq 免费'
    },
    gemini: {
        models: [
            { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' }
        ],
        hint: 'Google Gemini 免费'
    }
};

function syncConfigToUI() {
    providerSelect.value = apiConfig.provider;
    updateModelOptions();
    modelSelect.value = apiConfig.model;
    apiKeyInput.value = apiConfig.apiKey;
    updateApiSettingsBtn();
    updateConfigHint();
}

function updateModelOptions() {
    const config = PROVIDER_CONFIGS[apiConfig.provider];
    if (!config) return;
    modelSelect.innerHTML = config.models.map(m => `<option value="${m.value}">${m.label}</option>`).join('');
    if (!config.models.some(m => m.value === apiConfig.model)) {
        apiConfig.model = config.models[0].value;
    }
}

function updateConfigHint() {
    const config = PROVIDER_CONFIGS[apiConfig.provider];
    configHint.innerHTML = config ? config.hint : '';
}

function updateApiSettingsBtn() {
    if (apiConfig.apiKey) {
        apiSettingsBtn.classList.add('configured');
        apiSettingsBtn.title = 'API 已配置（自定义代理）';
    } else {
        apiSettingsBtn.classList.remove('configured');
        apiSettingsBtn.title = '高级 / 自定义 API';
    }
}

function openApiConfig() { syncConfigToUI(); apiConfigOverlay.classList.add('active'); document.body.style.overflow = 'hidden'; }
function closeApiConfig() { apiConfigOverlay.classList.remove('active'); document.body.style.overflow = ''; }

function setApiStatus(type, message) {
    if (!message) { apiStatus.innerHTML = ''; return; }
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', pending: 'fa-spinner fa-spin' };
    apiStatus.innerHTML = `<div class="config-status ${type}"><i class="fas ${icons[type] || 'fa-info-circle'}"></i> ${message}</div>`;
}

async function testConnection() {
    const key = apiKeyInput.value.trim();
    if (!key) { setApiStatus('error', '请先输入 API Key'); return; }
    setApiStatus('pending', '正在测试连接...');
    testConnectionBtn.disabled = true;
    try {
        const res = await fetch(`/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: '你好，回复"连接成功"', history: [], apiKey: key, provider: providerSelect.value, model: modelSelect.value, stream: false })
        });
        const data = await res.json();
        if (res.ok) setApiStatus('success', `✅ 连接成功！使用模型: ${data.model || '未知'}`);
        else if (res.status === 401) setApiStatus('error', '❌ API Key 无效，请检查');
        else if (res.status === 429) setApiStatus('error', '⚠️ 请求过于频繁');
        else setApiStatus('error', `❌ ${data.error || '连接失败'}`);
    } catch (err) {
        setApiStatus('error', '❌ 无法连接后端（自定义 API 需自托管后端）');
    } finally { testConnectionBtn.disabled = false; }
}

function saveApiConfig() {
    apiConfig = { provider: providerSelect.value, model: modelSelect.value, apiKey: apiKeyInput.value.trim() };
    saveConfig();
    updateApiSettingsBtn();
    closeApiConfig();
    setApiStatus(null);
    addAssistantMessageToUI('✅ 自定义 API 已保存！在模型选择器里选「自定义 API（自托管）」即可使用（需运行后端服务）。', true);
}

// =============================================
// 11. 工具弹窗
// =============================================
const toolConfigs = {
    writer: { title: 'AI 写作助手', label: '输入写作主题和要求', placeholder: '例如：帮我写一封邀请客户参加产品发布会的邮件...',
        generate: (i) => `【AI生成的文案】\n\n${i}\n\n---\n\n尊敬的客户：\n\n您好！感谢您一直以来对我们的支持与信任。我们非常高兴地通知您，经过团队的不懈努力，我们在相关领域取得了新的突破和进展。\n\n在此，我们诚挚地邀请您了解更多详情，并期待与您进一步沟通。\n\n此致\n敬礼\n\nAI智能团队` },
    translate: { title: '智能翻译', label: '输入要翻译的文本', placeholder: '输入需要翻译的文字...',
        generate: (i) => `【翻译结果】\n\n原文：${i}\n\n中文翻译：\n${i} 的智能翻译结果。` },
    summary: { title: '文章总结', label: '粘贴文章内容', placeholder: '将需要总结的文章内容粘贴到这里...',
        generate: (i) => `【文章总结】\n\n📋 核心要点：\n\n1️⃣ 主要议题：${i.slice(0, 30)}...\n\n2️⃣ 关键观点：文章围绕上述主题展开了深入讨论。\n\n3️⃣ 结论：综合全文内容，得出以下几点重要结论。` },
    code: { title: '代码助手', label: '描述你需要实现的代码功能', placeholder: '例如：用Python写一个快速排序算法...',
        generate: (i) => `【代码生成】\n\n根据需求 "${i}"，以下是参考实现：\n\n\`\`\`python\n# 自动生成的代码\ndef solution(data):\n    result = []\n    for item in data:\n        result.append(item)\n    return result\n\`\`\`` },
    idea: { title: '创意生成器', label: '输入你的需求或方向', placeholder: '例如：给我一些创业点子、活动创意...',
        generate: (i) => `【创意方案】\n\n基于 "${i}" 的创意灵感 💡\n\n🎯 创意一：跨界融合\n🎯 创意二：社交裂变\n🎯 创意三：个性化定制\n\n🚀 行动建议：从最小可行方案开始验证。` },
    analysis: { title: '数据分析', label: '描述你需要分析的数据场景', placeholder: '例如：分析用户留存率下降的原因...',
        generate: (i) => `【数据分析报告】\n\n📊 分析主题：${i}\n\n📈 分析维度：\n1️⃣ 现状评估 — 数据表现正常\n2️⃣ 关键发现 — 发现新的增长机会\n3️⃣ 优化建议 — 聚焦核心问题改进` }
};

function openToolModal(toolType) {
    const config = toolConfigs[toolType];
    if (!config) return;
    modalTitle.textContent = config.title;
    modalInputLabel.textContent = config.label;
    modalInput.placeholder = config.placeholder;
    modalInput.value = '';
    modalResult.style.display = 'none';
    modalContent.dataset.tool = toolType;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}
function closeToolModal() { modal.classList.remove('active'); document.body.style.overflow = ''; }

function handleToolGenerate() {
    const toolType = modalContent.dataset.tool;
    const config = toolConfigs[toolType];
    const input = modalInput.value.trim();
    if (!input) {
        modalInput.style.borderColor = '#ef4444'; modalInput.focus();
        setTimeout(() => { modalInput.style.borderColor = ''; }, 2000);
        return;
    }
    const result = config.generate(input);
    modalResultContent.innerHTML = `<div class="md-content">${renderMarkdown(result)}</div>`;
    enhanceCodeBlocks(modalResultContent);
    modalResult.style.display = 'block';
    modalResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// =============================================
// 12. 工具函数
// =============================================
function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 140) + 'px';
}

function bindSuggestionChips() {
    chatMessages.querySelectorAll('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            chatInput.value = chip.dataset.prompt;
            autoResizeTextarea(chatInput);
            sendBtn.disabled = false;
            chatInput.focus();
            handleSendMessage();
        });
    });
}

// =============================================
// 13. 主题 / 导航 / 动画
// =============================================
function initTheme() {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'dark' || (!saved && prefersDark)) {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }
}
function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) { document.documentElement.removeAttribute('data-theme'); localStorage.setItem('theme', 'light'); themeToggle.innerHTML = '<i class="fas fa-moon"></i>'; }
    else { document.documentElement.setAttribute('data-theme', 'dark'); localStorage.setItem('theme', 'dark'); themeToggle.innerHTML = '<i class="fas fa-sun"></i>'; }
}

function toggleMobileMenu() { navLinks.classList.toggle('open'); mobileBtn.classList.toggle('active'); }
function closeMobileMenu() { navLinks.classList.remove('open'); mobileBtn.classList.remove('active'); }

function updateActiveNav() {
    const sections = $$('section[id]');
    const scrollPos = window.scrollY + 120;
    sections.forEach(section => {
        const top = section.offsetTop, height = section.offsetHeight, id = section.getAttribute('id');
        const link = $(`.nav-links a[href="#${id}"]`);
        if (link && scrollPos >= top && scrollPos < top + height) {
            $$('.nav-links a').forEach(a => a.classList.remove('active'));
            link.classList.add('active');
        }
    });
}
function handleScroll() {
    if (window.scrollY > 50) navbar.classList.add('scrolled'); else navbar.classList.remove('scrolled');
    if (window.scrollY > 400) backToTop.classList.add('visible'); else backToTop.classList.remove('visible');
    updateActiveNav();
}

function animateCounters() {
    $$('.stat-number').forEach(counter => {
        const target = parseFloat(counter.dataset.target);
        const isDecimal = target % 1 !== 0;
        const increment = target / 30;
        let current = 0;
        const update = () => {
            current += increment;
            if (current < target) { counter.textContent = isDecimal ? current.toFixed(1) : Math.floor(current); requestAnimationFrame(update); }
            else { counter.textContent = isDecimal ? target.toString() : Math.floor(target); }
        };
        update();
    });
}

function initScrollAnimations() {
    const elements = $$('.tool-card, .feature-card, .section-header, .cta-card');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => { if (entry.isIntersecting) { entry.target.style.opacity = '1'; entry.target.style.transform = 'translateY(0)'; } });
    }, { threshold: 0.1 });
    elements.forEach(el => { el.style.opacity = '0'; el.style.transform = 'translateY(20px)'; el.style.transition = 'opacity 0.6s ease, transform 0.6s ease'; observer.observe(el); });
}

// =============================================
// 14. 事件绑定
// =============================================
function initEvents() {
    themeToggle.addEventListener('click', toggleTheme);
    mobileBtn.addEventListener('click', toggleMobileMenu);
    navLinks.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMobileMenu));
    window.addEventListener('scroll', handleScroll, { passive: true });
    backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // 发送
    sendBtn.addEventListener('click', () => {
        if (isGenerating) { stopRequested = true; if (abortCtrl) abortCtrl.abort(); }
        else handleSendMessage();
    });
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
    });
    chatInput.addEventListener('input', () => { autoResizeTextarea(chatInput); sendBtn.disabled = !chatInput.value.trim() || isGenerating; });

    // 快捷推荐（输入框上方）
    suggestions.forEach(chip => {
        chip.addEventListener('click', () => {
            chatInput.value = chip.dataset.prompt;
            autoResizeTextarea(chatInput);
            sendBtn.disabled = false;
            chatInput.focus();
        });
    });

    // 清空当前对话
    clearChat.addEventListener('click', () => {
        const conv = getActiveConversation();
        if (!conv) return;
        if (confirm('确定要清空当前对话吗？')) {
            conv.messages = [];
            saveConversations();
            renderActiveConversation();
        }
    });

    // 侧边栏
    newChatBtn.addEventListener('click', () => createConversation());
    sidebarToggle.addEventListener('click', () => chatApp.classList.toggle('sidebar-collapsed'));
    mobileChatMenu.addEventListener('click', () => chatApp.classList.toggle('sidebar-collapsed'));

    // 模型选择器
    modelSelectorBtn.addEventListener('click', (e) => { e.stopPropagation(); modelSelector.classList.contains('open') ? closeModelDropdown() : openModelDropdown(); });
    document.addEventListener('click', (e) => { if (!modelSelector.contains(e.target)) closeModelDropdown(); });

    // 工具卡片
    toolCards.forEach(card => card.addEventListener('click', () => openToolModal(card.dataset.tool)));
    modalClose.addEventListener('click', closeToolModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeToolModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeToolModal(); closeApiConfig(); } });
    modalSubmit.addEventListener('click', handleToolGenerate);
    copyResult.addEventListener('click', () => {
        const text = modalResultContent.textContent;
        navigator.clipboard.writeText(text).then(() => {
            const orig = copyResult.innerHTML;
            copyResult.innerHTML = '<i class="fas fa-check"></i> 已复制';
            setTimeout(() => { copyResult.innerHTML = orig; }, 2000);
        }).catch(() => {});
    });

    // API 配置
    apiSettingsBtn.addEventListener('click', openApiConfig);
    apiConfigClose.addEventListener('click', closeApiConfig);
    apiConfigOverlay.addEventListener('click', (e) => { if (e.target === apiConfigOverlay) closeApiConfig(); });
    providerSelect.addEventListener('change', () => { apiConfig.provider = providerSelect.value; updateModelOptions(); updateConfigHint(); setApiStatus(null); });
    testConnectionBtn.addEventListener('click', testConnection);
    saveConfigBtn.addEventListener('click', saveApiConfig);
}

// =============================================
// 15. 初始化
// =============================================
function init() {
    initTheme();
    initEvents();
    initScrollAnimations();

    // 侧边栏初始（移动端默认收起）
    if (window.innerWidth <= 768) chatApp.classList.add('sidebar-collapsed');

    updateApiSettingsBtn();
    syncModelSelector();
    renderConversationList();
    renderActiveConversation();
    sendBtn.disabled = !chatInput.value.trim();

    // 尝试从后端获取预配置（自托管时有效）
    fetch(`/api/config`).then(r => r.json()).then(config => {
        if (config.apiKey && !apiConfig.apiKey) {
            apiConfig = { provider: config.provider || 'github', model: config.model || 'gpt-4.1', apiKey: config.apiKey };
            saveConfig();
            updateApiSettingsBtn();
            apiKeyInput.value = config.apiKey;
        }
    }).catch(() => {});

    // 数字动画
    const heroObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => { if (entry.isIntersecting) { animateCounters(); heroObserver.disconnect(); } });
    }, { threshold: 0.5 });
    const stats = $('.hero-stats');
    if (stats) heroObserver.observe(stats);

    // 后端健康检查（仅自托管后端有效，GitHub Pages 会失败，忽略）
    fetch(`/api/health`).then(r => r.json()).then(data => {
        console.log(`✅ 后端已连接，支持: ${data.providers.join(', ')}`);
    }).catch(() => console.log('ℹ️ 当前为静态托管（GitHub Pages），使用 Puter.js 免费直连'));
}

document.addEventListener('DOMContentLoaded', init);

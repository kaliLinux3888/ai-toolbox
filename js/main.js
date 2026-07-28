/**
 * AI智能工具�? - 主脚�?
 * 包含：API集成、聊天、工具、主题、动画等
 */

'use strict';

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

const chatMessages = $('#chatMessages');
const chatInput = $('#chatInput');
const sendBtn = $('#sendBtn');
const clearChat = $('#clearChat');
const suggestions = $$('.suggestion-chip');

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
// 2. API 配置管理
// =============================================
// API 路径（同源，�? Express 统一提供 static + API�?

const PROVIDER_CONFIGS = {
    github: {
        models: [
            { value: 'gpt-4.1', label: 'GPT-4.1 (最新)' },
            { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
            { value: 'gpt-4.1-nano', label: 'GPT-4.1 nano' },
            { value: 'gpt-4o', label: 'GPT-4o' },
            { value: 'gpt-4o-mini', label: 'GPT-4o mini' }
        ],
        hint: 'GitHub免费, 已自动配置'
    },
    chatanywhere: {
        models: [
            { value: 'gpt-5.6-sol-ca', label: 'GPT-5.6 Sol' },
            { value: 'gpt-5.6-terra-ca', label: 'GPT-5.6 Terra' },
            { value: 'gpt-5.6-luna-ca', label: 'GPT-5.6 Luna' },
            { value: 'gpt-5.5-ca', label: 'GPT-5.5 (付费)' },
            { value: 'gpt-5.2-ca', label: 'GPT-5.2' },
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
        hint: 'OpenRouter GPT-5.5需充值'
    },
    groq: {
        models: [
            { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
            { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B' }
        ],
        hint: 'Groq免费'
    },
    gemini: {
        models: [
            { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' }
        ],
        hint: 'Google Gemini免费'
    }
};

let apiConfig = loadConfig();

function loadConfig() {
    try {
        const saved = localStorage.getItem('ai_api_config');
        if (saved) {
            const parsed = JSON.parse(saved);
            return {
                provider: parsed.provider || 'github',
                model: parsed.model || 'gpt-4.1',
                apiKey: parsed.apiKey || ''
            };
        }
    } catch (e) {}
    return { provider: 'github', model: 'gpt-4o', apiKey: '' };
}

function saveConfig() {
    localStorage.setItem('ai_api_config', JSON.stringify(apiConfig));
}

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
    modelSelect.innerHTML = config.models.map(m =>
        `<option value="${m.value}">${m.label}</option>`
    ).join('');
    // 如果当前模型不在新列表中，选第一�?
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
        apiSettingsBtn.title = 'API 已配�?';
    } else {
        apiSettingsBtn.classList.remove('configured');
        apiSettingsBtn.title = '点击配置 API';
    }
}

// =============================================
// 3. API 聊天功能
// =============================================

// 对话历史缓存
let chatHistory = [];

async function callAIAPI(message) {
    // 1. 优先使用 Puter.js (免费, 无需任何key)
    if (typeof puter !== 'undefined') {
        try {
            const response = await puter.ai.chat(message, {
                model: 'gpt-5.5',
                stream: false
            });
            if (response) {
                // 标记当前使用Puter
                window._usingPuter = true;
                return response?.message?.content || response;
            }
        } catch (e) {
            // Puter可能需要登录, 静默回退到其他方案
            if (e.message && e.message.includes('auth')) {
                console.log('[Puter] 需要登录, 将弹出Puter登录窗口');
            }
            console.log('[Puter] 回退: ' + e.message);
        }
    }

    // 2. 如果有 API Key, 调用后端代理
    if (apiConfig.apiKey) {
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message,
                    history: chatHistory,
                    apiKey: apiConfig.apiKey,
                    provider: apiConfig.provider,
                    model: apiConfig.model
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
            return data.reply;
        } catch (err) {
            throw new Error(err.message);
        }
    }

    // 3. 本地离线
    return getLocalResponse(message);
}

// =============================================
// 4. 本地模拟回复 (离线备用)
// =============================================
const localResponses = [
    { kw: ['你好', '�?', 'hi', 'hello', '您好'], reply: '你好！很高兴见到�? 😊 有什么我可以帮你的吗�?' },
    { kw: ['邮件', '写一�?'], reply: '当然可以！请告诉我邮件的主题、收件人和主要内容，我帮你生成�?' },
    { kw: ['健身', '运动', '计划'], reply: '💪 建议每周3-4次训练，每次45-60分钟。需要我给你定制计划吗？' },
    { kw: ['�?', '推荐', '读书'], reply: '📚 推荐《原子习惯》《思考快与慢》《人类简史》，都是经典好书�?' },
    { kw: ['编程', '学习', 'python'], reply: '💻 入门推荐 Python，语法简洁资源多。建议从基础语法→小项目→框架逐步学习�?' },
    { kw: ['翻译'], reply: '🌐 请直接发送需要翻译的内容，我会帮你翻译成中文或英文�?' },
    { kw: ['谢谢', '感谢'], reply: '不客气！很高兴能帮到�? 😊' },
    { kw: ['你是�?'], reply: '我是 AI智能助手 🤖，你的多功能AI伙伴�?' },
    { kw: ['笑话'], reply: '😄 程序员问妻子�?"我不在家时你会想我吗�?" 妻子答："会啊，尤其是我在用电脑的时候�?"' }
];

function getLocalResponse(msg) {
    const lower = msg.toLowerCase();
    for (const item of localResponses) {
        if (item.kw.some(k => lower.includes(k))) return item.reply;
    }
    const fallbacks = [
        '这个问题很有意思！能说说更多细节吗？�?',
        '好问题！让我从几个角度来帮你分析 🎯',
        '感谢提问！你可以先告诉我更多背景信息 💡',
        '🔔 提示：配置免费的 API Key 后，我就能用 AI 大模型回答你的任何问题了�?'
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

// =============================================
// 5. 对话界面函数
// =============================================
function addMessage(content, isUser) {
    const div = document.createElement('div');
    div.className = `message ${isUser ? 'message-user' : 'message-ai'}`;

    const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    div.innerHTML = `
        <div class="message-avatar"><i class="fas ${isUser ? 'fa-user' : 'fa-robot'}"></i></div>
        <div class="message-content">
            <div class="message-bubble">${content}</div>
            <span class="message-time">${time}</span>
        </div>
    `;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTyping() {
    const div = document.createElement('div');
    div.className = 'message message-ai';
    div.id = 'typingIndicator';
    div.innerHTML = `
        <div class="message-avatar"><i class="fas fa-robot"></i></div>
        <div class="message-content">
            <div class="message-bubble">
                <div class="message-typing"><span></span><span></span><span></span></div>
            </div>
        </div>
    `;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTyping() {
    const el = $('#typingIndicator');
    if (el) el.remove();
}

function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML.replace(/\n/g, '<br>');
}

async function handleSendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    // 显示用户消息
    addMessage(escapeHtml(text), true);
    chatInput.value = '';
    chatInput.style.height = 'auto';
    sendBtn.disabled = true;

    // 更新历史
    chatHistory.push({ role: 'user', content: text });

    // 显示打字
    showTyping();

    try {
        const reply = await callAIAPI(text);
        removeTyping();
        const formatted = reply.replace(/\n/g, '<br>').replace(/```(\w*)\n?/g, '<pre><code>').replace(/```/g, '</code></pre>');
        addMessage(formatted, false);

        // 更新历史
        chatHistory.push({ role: 'assistant', content: reply });
    } catch (err) {
        removeTyping();
        const errMsg = err.message.includes('API Key')
            ? '⚠️ API Key 无效，请在设置中重新配置。你也可以免费获取一�? Key（无需信用卡）💡'
            : `⚠️ ${err.message}`;
        addMessage(errMsg, false);
    } finally {
        sendBtn.disabled = false;
        chatInput.focus();
    }
}

// =============================================
// 6. API 配置面板逻辑
// =============================================
function openApiConfig() {
    syncConfigToUI();
    apiConfigOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeApiConfig() {
    apiConfigOverlay.classList.remove('active');
    document.body.style.overflow = '';
}

function setApiStatus(type, message) {
    if (!message) {
        apiStatus.innerHTML = '';
        return;
    }
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', pending: 'fa-spinner fa-spin' };
    apiStatus.innerHTML = `<div class="config-status ${type}"><i class="fas ${icons[type] || 'fa-info-circle'}"></i> ${message}</div>`;
}

async function testConnection() {
    const key = apiKeyInput.value.trim();
    if (!key) {
        setApiStatus('error', '请先输入 API Key');
        return;
    }

    setApiStatus('pending', '正在测试连接...');
    testConnectionBtn.disabled = true;

    try {
        const res = await fetch(`/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: '你好！请回复"连接成功"四个字�?',
                history: [],
                apiKey: key,
                provider: providerSelect.value,
                model: modelSelect.value
            })
        });

        const data = await res.json();

        if (res.ok) {
            setApiStatus('success', `�? 连接成功！使用模�?: ${data.model || '未知'}`);
        } else if (res.status === 401) {
            setApiStatus('error', '�? API Key 无效，请检查后重试');
        } else if (res.status === 429) {
            setApiStatus('error', '⚠️ 请求频率过高，请稍后重试');
        } else {
            setApiStatus('error', `�? ${data.error || '连接失败'}`);
        }
    } catch (err) {
        setApiStatus('error', '�? 无法连接到后端服务，请确保服务器已启�?');
    } finally {
        testConnectionBtn.disabled = false;
    }
}

function saveApiConfig() {
    const key = apiKeyInput.value.trim();
    const provider = providerSelect.value;
    const model = modelSelect.value;

    apiConfig = { provider, model, apiKey: key };
    saveConfig();
    updateApiSettingsBtn();
    closeApiConfig();
    setApiStatus(null);

    // 如果配置�? Key，添加系统消息提�?
    if (key) {
        addMessage('�? API 配置已保存！现在我是 AI 驱动的了，问我任何问题吧！🚀', false);
    }
}

// =============================================
// 7. 工具弹窗功能
// =============================================
const toolConfigs = {
    writer: {
        title: 'AI 写作助手',
        label: '输入写作主题和要�?',
        placeholder: '例如：帮我写一封邀请客户参加产品发布会的邮�?...',
        generate: (input) => `【AI生成的文案】\n\n${input}\n\n---\n\n尊敬的客户：\n\n您好！\n\n感谢您一直以来对我们的支持与信任。我们非常高兴地通知您，经过团队的不懈努力，我们在相关领域取得了新的突破和进展。\n\n在此，我们诚挚地邀请您了解更多详情，并期待与您进一步沟通。\n\n此致\n敬礼\n\nAI智能团队`
    },
    translate: {
        title: '智能翻译',
        label: '输入要翻译的文本',
        placeholder: '输入需要翻译的文字...',
        generate: (input) => `【翻译结果】\n\n原文�?${input}\n\n中文翻译：\n${input} 的智能翻译结果。`
    },
    summary: {
        title: '文章总结',
        label: '粘贴文章内容',
        placeholder: '将需要总结的文章内容粘贴到这里...',
        generate: (input) => `【文章总结】\n\n📋 核心要点：\n\n1️⃣ 主要议题�?${input.slice(0, 30)}...\n\n2️⃣ 关键观点：文章围绕上述主题展开了深入讨论。\n\n3️⃣ 结论：综合全文内容，得出以下几点重要结论。`
    },
    code: {
        title: '代码助手',
        label: '描述你需要实现的代码功能',
        placeholder: '例如：用Python写一个快速排序算�?...',
        generate: (input) => `【代码生成】\n\n根据需�? "${input}"，以下是参考实现：\n\n\`\`\`python\n# 自动生成的代码\ndef solution(data):\n    result = []\n    for item in data:\n        result.append(item)\n    return result\n\`\`\``
    },
    idea: {
        title: '创意生成�?',
        label: '输入你的需求或方向',
        placeholder: '例如：给我一些创业点子、活动创�?...',
        generate: (input) => `【创意方案】\n\n基于 "${input}" 的创意灵�? 💡\n\n🎯 创意一：跨界融合\n🎯 创意二：社交裂变\n🎯 创意三：个性化定制\n\n🚀 行动建议：从最小可行方案开始验证。`
    },
    analysis: {
        title: '数据分析',
        label: '描述你需要分析的数据场景',
        placeholder: '例如：分析用户留存率下降的原�?...',
        generate: (input) => `【数据分析报告】\n\n📊 分析主题�?${input}\n\n📈 分析维度：\n1️⃣ 现状评估 �? 数据表现正常\n2️⃣ 关键发现 �? 发现新的增长机会\n3️⃣ 优化建议 �? 聚焦核心问题改进`
    }
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

function closeToolModal() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

function handleToolGenerate() {
    const toolType = modalContent.dataset.tool;
    const config = toolConfigs[toolType];
    const input = modalInput.value.trim();
    if (!input) {
        modalInput.style.borderColor = '#ef4444';
        modalInput.focus();
        setTimeout(() => { modalInput.style.borderColor = ''; }, 2000);
        return;
    }
    const result = config.generate(input);
    modalResultContent.innerHTML = result.replace(/\n/g, '<br>').replace(/```(\w*)\n?/g, '<pre><code>').replace(/```/g, '</code></pre>');
    modalResult.style.display = 'block';
    modalResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// =============================================
// 8. 工具函数
// =============================================
function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

// =============================================
// 9. 主题切换
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
    if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }
}

// =============================================
// 10. 导航
// =============================================
function toggleMobileMenu() {
    navLinks.classList.toggle('open');
    mobileBtn.classList.toggle('active');
}

function closeMobileMenu() {
    navLinks.classList.remove('open');
    mobileBtn.classList.remove('active');
}

function updateActiveNav() {
    const sections = $$('section[id]');
    const scrollPos = window.scrollY + 120;
    sections.forEach(section => {
        const top = section.offsetTop;
        const height = section.offsetHeight;
        const id = section.getAttribute('id');
        const link = $(`.nav-links a[href="#${id}"]`);
        if (link) {
            if (scrollPos >= top && scrollPos < top + height) {
                $$('.nav-links a').forEach(a => a.classList.remove('active'));
                link.classList.add('active');
            }
        }
    });
}

function handleScroll() {
    if (window.scrollY > 50) navbar.classList.add('scrolled');
    else navbar.classList.remove('scrolled');

    if (window.scrollY > 400) backToTop.classList.add('visible');
    else backToTop.classList.remove('visible');

    updateActiveNav();
}

// =============================================
// 11. 数字动画
// =============================================
function animateCounters() {
    $$('.stat-number').forEach(counter => {
        const target = parseFloat(counter.dataset.target);
        const isDecimal = target % 1 !== 0;
        const increment = target / 30;
        let current = 0;
        const update = () => {
            current += increment;
            if (current < target) {
                counter.textContent = isDecimal ? current.toFixed(1) : Math.floor(current);
                requestAnimationFrame(update);
            } else {
                counter.textContent = isDecimal ? target.toString() : Math.floor(target);
            }
        };
        update();
    });
}

// =============================================
// 12. 入场动画
// =============================================
function initScrollAnimations() {
    const elements = $$('.tool-card, .feature-card, .section-header, .cta-card');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1 });
    elements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
}

// =============================================
// 13. 事件绑定
// =============================================
function initEvents() {
    // 主题
    themeToggle.addEventListener('click', toggleTheme);

    // 菜单
    mobileBtn.addEventListener('click', toggleMobileMenu);
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', closeMobileMenu);
    });

    // 滚动
    window.addEventListener('scroll', handleScroll, { passive: true });

    // 回到顶部
    backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // 聊天发�?
    sendBtn.addEventListener('click', handleSendMessage);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });
    chatInput.addEventListener('input', () => autoResizeTextarea(chatInput));
    chatInput.addEventListener('input', () => {
        sendBtn.disabled = !chatInput.value.trim();
    });

    // 快捷推荐
    suggestions.forEach(chip => {
        chip.addEventListener('click', () => {
            chatInput.value = chip.dataset.prompt;
            autoResizeTextarea(chatInput);
            sendBtn.disabled = false;
            chatInput.focus();
        });
    });

    // 清空对话
    clearChat.addEventListener('click', () => {
        if (confirm('确定要清空所有对话吗�?')) {
            chatMessages.innerHTML = '';
            chatHistory = [];
            // 重新添加欢迎消息
            addMessage('你好！�? 我是 AI 智能助手，有什么可以帮助你的吗�?', false);
        }
    });

    // 工具卡片
    toolCards.forEach(card => {
        card.addEventListener('click', () => openToolModal(card.dataset.tool));
    });

    // 工具弹窗
    modalClose.addEventListener('click', closeToolModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeToolModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeToolModal(); });
    modalSubmit.addEventListener('click', handleToolGenerate);
    copyResult.addEventListener('click', () => {
        const text = modalResultContent.textContent;
        navigator.clipboard.writeText(text).then(() => {
            const orig = copyResult.innerHTML;
            copyResult.innerHTML = '<i class="fas fa-check"></i> 已复�?';
            setTimeout(() => { copyResult.innerHTML = orig; }, 2000);
        }).catch(() => {
            const range = document.createRange();
            range.selectNode(modalResultContent);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            document.execCommand('copy');
            window.getSelection().removeAllRanges();
        });
    });

    // API 配置
    apiSettingsBtn.addEventListener('click', openApiConfig);
    apiConfigClose.addEventListener('click', closeApiConfig);
    apiConfigOverlay.addEventListener('click', (e) => {
        if (e.target === apiConfigOverlay) closeApiConfig();
    });

    providerSelect.addEventListener('change', () => {
        apiConfig.provider = providerSelect.value;
        updateModelOptions();
        updateConfigHint();
        // 清空状态提�?
        setApiStatus(null);
    });

    testConnectionBtn.addEventListener('click', testConnection);
    saveConfigBtn.addEventListener('click', saveApiConfig);
}

// =============================================
// 14. 初始�?
// =============================================
function init() {
    initTheme();
    initEvents();
    initScrollAnimations();

    // 同步 API 配置�? UI
    updateApiSettingsBtn();

    // 尝试从服务器获取预配�?
    fetch(`/api/config`)
        .then(r => r.json())
        .then(config => {
            if (config.apiKey) {
                // 用户还没保存过配置，或配置为空时自动填充
                if (!apiConfig.apiKey) {
                    apiConfig = { provider: config.provider, model: config.model, apiKey: config.apiKey };
                    saveConfig();
                    syncConfigToUI();
                    addMessage('🎉 已自动配�? <b>GitHub Models</b>（GPT-4o），现在可以问我任何问题了！', false);
                } else {
                    // 已有配置，但面板里预填一�?
                    apiKeyInput.value = config.apiKey;
                }
                console.log('�? GitHub Models 已就�?');
            }
        })
        .catch(() => console.log('ℹ️ 未检测到预配�?'));

    // 数字动画
    const heroObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounters();
                heroObserver.disconnect();
            }
        });
    }, { threshold: 0.5 });
    heroObserver.observe($('.hero-stats'));

    // 检查后端连接状�?
    fetch(`/api/health`)
        .then(r => r.json())
        .then(data => {
            console.log(`�? 后端服务已连�?, 支持: ${data.providers.join(', ')}`);
        })
        .catch(() => {
            console.warn('⚠️ 后端服务未启动，对话将使用本地模�?');
        });
}

document.addEventListener('DOMContentLoaded', init);

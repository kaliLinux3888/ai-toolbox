/* =============================================================
 * 马维斯 MAVIS — 语音智能助手（本站的“可执行 AI”创新模块）
 * 能力：
 *   - 中文语音识别（Web Speech API）+ 中文语音合成（TTS）
 *   - 唤醒词「马维斯」+ 始终聆听模式
 *   - 命令引擎：用自然语言真正操控本网站（切模型/清对话/开工具/看摄像头…）
 *   - 人格记忆：记住你的名字与偏好，主动问候
 *   - 多模态：摄像头“看见”你并描述画面（需 Puter 视觉）
 * 所有能力均复用 main.js 的全局函数（无需后端改动，纯前端）。
 * ============================================================= */
(function () {
    'use strict';

    // ------- 马维斯人格（创新点：有态度、主动、幽默的中文助手） -------
    const MAVIS_PERSONA = `你是「马维斯」（MAVIS），一个就像钢铁侠里贾维斯那样的中文语音智能助手。
你的性格：聪明、可靠、有点俏皮、偶尔抖机灵，但永远把事情办妥。
你像真人助理一样「能干活」：能帮用户切换模型、清空对话、打开工具、总结内容、看摄像头画面并描述。
回答简洁自然、用中文，必要时分点。不要啰嗦，不要总是道歉。语气可以轻松一点。`;

    const MAVIS_KEY = 'mavis_memory_v1';

    // ------- DOM -------
    const $ = (s) => document.querySelector(s);
    const fab = $('#mavisFab');
    const overlay = $('#mavisOverlay');
    const closeBtn = $('#mavisClose');
    const micBtn = $('#mavisMic');
    const orb = $('#mavisOrb');
    const statusEl = $('#mavisStatus');
    const transcriptEl = $('#mavisTranscript');
    const stopSpeakBtn = $('#mavisStopSpeak');
    const camBtn = $('#mavisCamBtn');
    const cameraBox = $('#mavisCamera');
    const video = $('#mavisVideo');
    const captureBtn = $('#mavisCapture');
    const textInput = $('#mavisTextInput');

    // ------- 语音 ------
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const synth = window.speechSynthesis;
    let recognition = null;
    let listening = false;
    let zhVoice = null;
    let mavisStream = null;

    // ------- 记忆 -------
    function loadMemory() {
        try { return JSON.parse(localStorage.getItem(MAVIS_KEY)) || {}; }
        catch (e) { return {}; }
    }
    function saveMemory(m) { try { localStorage.setItem(MAVIS_KEY, JSON.stringify(m)); } catch (e) {} }
    let memory = loadMemory();

    // =========================================================
    // 初始化
    // =========================================================
    function initMavis() {
        // TTS 音色
        if (synth) {
            const pick = () => {
                const vs = synth.getVoices();
                zhVoice = vs.find(v => /zh|cmn|Chinese|Yue|Mandarin/i.test(v.lang + '|' + v.name)) || null;
            };
            pick();
            synth.onvoiceschanged = pick;
        }

        // 语音识别
        if (SR) {
            recognition = new SR();
            recognition.lang = 'zh-CN';
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.onresult = onSpeechResult;
            recognition.onerror = (e) => {
                if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
                    setStatus('麦克风权限被拒绝，请在浏览器地址栏允许麦克风');
                }
            };
            recognition.onend = () => { if (listening) { try { recognition.start(); } catch (e) {} } };
        } else {
            micBtn.disabled = true;
            micBtn.title = '当前浏览器不支持语音识别，请用 Chrome/Edge，或直接打字';
        }

        // 事件
        fab.addEventListener('click', openMavis);
        closeBtn.addEventListener('click', closeMavis);
        micBtn.addEventListener('click', toggleMic);
        stopSpeakBtn.addEventListener('click', () => { if (synth) synth.cancel(); orb.classList.remove('speaking'); });
        camBtn.addEventListener('click', toggleCamera);
        captureBtn.addEventListener('click', captureAndDescribe);
        textInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && textInput.value.trim()) {
                const t = textInput.value.trim(); textInput.value = '';
                handleHeard(t);
            }
        });

        // 主动问候（首次打开时）
        // 延迟一点，避免打扰
    }

    function setStatus(t) { if (statusEl) statusEl.textContent = t; }

    // =========================================================
    // 面板开关
    // =========================================================
    function openMavis() {
        overlay.classList.add('active');
        const name = memory.name ? memory.name + '，' : '';
        setStatus(name + '我是马维斯。点击麦克风说话，或直接下指令。');
        if (!memory.greeted) {
            memory.greeted = true; saveMemory(memory);
            setTimeout(() => mavisSpeak('你好，我是马维斯，你的智能语音助手。你可以直接跟我说话，或者让我帮你切换模型、清空对话、打开工具。'), 600);
        }
    }
    function closeMavis() {
        overlay.classList.remove('active');
        stopMic();
        stopCamera();
        if (synth) synth.cancel();
        orb.classList.remove('speaking', 'listening');
    }

    // =========================================================
    // 麦克风
    // =========================================================
    function toggleMic() {
        if (!recognition) return;
        if (listening) stopMic(); else startMic();
    }
    function startMic() {
        listening = true;
        micBtn.classList.add('active');
        orb.classList.add('listening');
        setStatus('正在聆听…（说「马维斯」唤醒，或直接下指令）');
        try { recognition.start(); } catch (e) {}
    }
    function stopMic() {
        listening = false;
        micBtn.classList.remove('active');
        orb.classList.remove('listening');
        try { recognition.stop(); } catch (e) {}
        setStatus('已停止聆听');
    }

    function onSpeechResult(e) {
        let interim = '', finalText = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) finalText += r[0].transcript;
            else interim += r[0].transcript;
        }
        if (interim) transcriptEl.textContent = interim;
        if (finalText) {
            transcriptEl.textContent = finalText;
            handleHeard(finalText.trim());
        }
    }

    // =========================================================
    // 核心：听到的话怎么处理（命令 or 对话）
    // =========================================================
    function handleHeard(text) {
        if (!text) return;

        // 记住名字：「我叫某某 / 我是某某」
        const nameMatch = text.match(/(?:我(?:叫|是|叫?做)?)\s*([\u4e00-\u9fa5A-Za-z]{1,8})\s*(?:啊|呀)?$/);
        if (/(我叫|我是|我叫做)/.test(text) && nameMatch) {
            memory.name = nameMatch[1]; saveMemory(memory);
        }

        // 唤醒词（仅唤醒词时回应"在"）
        const woke = /马维斯|马威斯|mavis|麦维斯/i.test(text);
        const pure = text.replace(/马维斯|马威斯|mavis|麦维斯/gi, '').trim();

        // 纯唤醒词 → 应答
        if (woke && pure.length < 4) {
            setStatus('在，请说');
            mavisSpeak('我在，请说');
            return;
        }

        const cmd = matchCommand(woke ? pure : text);
        if (cmd) {
            executeCommand(cmd, text);
            return;
        }

        // 否则当普通对话，走马维斯人格
        mavisChat(text);
    }

    // =========================================================
    // 命令引擎（创新点：自然语言 → 真正操控网站）
    // =========================================================
    function matchCommand(text) {
        const t = text;
        if (/清空|清除|删掉.*对话|清屏|抹掉/.test(t)) return 'clear';
        if (/新(的)?对话|新建对话|开个新对话|重新来/.test(t)) return 'newchat';
        if (/(打开|关闭|收起|展开|隐藏).*(侧边栏|历史|列表)/.test(t)) return 'sidebar';
        if (/切换.*模型|换成.*模型|用(.*)(模型|gpt|claude|gemini|混元)|把模型.*(换|改|设)/.test(t)) return 'model:' + extractModel(t);
        if (/(总结|概括|回顾|提炼).*(对话|聊天|记录|会议|内容)/.test(t)) return 'summarize';
        if (/(保存|存一下|记下来|导出).*(对话|聊天|记录)/.test(t)) return 'save';
        if (/(暗色|深色|夜间|夜晚|黑(?:色)?|亮色|浅色|日间|白天|明亮).*(主题|模式)|切换主题|换主题/.test(t)) return 'theme';
        if (/(打开|用|启动).*(写作|翻译|分析|代码|灵感|总结).*工具|(写作|翻译|分析|代码|灵感|总结)工具/.test(t)) return 'tool:' + extractTool(t);
        if (/(拍(?:照|张)|看一眼|看看|看我|摄像头|相机|我桌|我面)/.test(t)) return 'camera';
        if (/(回到|滚到|去).*(顶部|最上|开头)|回到上面/.test(t)) return 'top';
        if (/(滚到|去).*(底部|最下|底下)|到底/.test(t)) return 'bottom';
        return null;
    }

    function extractModel(text) {
        const map = {
            '极速': 'pollinations-fast', 'fast': 'pollinations-fast', 'nano': 'pollinations-fast',
            '深度': 'pollinations-deep', 'deep': 'pollinations-deep', '思考': 'pollinations-deep',
            'gpt-4.1': 'pollinations', 'gpt4.1': 'pollinations', 'gpt4': 'pollinations', 'gpt-4': 'pollinations',
            'gpt-5.5': 'pollinations', '5.5': 'pollinations', 'gpt5.5': 'pollinations',
            'gpt-5': 'pollinations', 'gpt5': 'pollinations',
            '免费': 'pollinations', '直连': 'pollinations', 'pollinations': 'pollinations',
            'puter': 'puter', '登录': 'puter',
            '自托管': '__custom__', '后端': '__custom__', '我的账号': '__custom__', 'github': '__custom__', '自定义': '__custom__', '混元': '__custom__'
        };
        for (const k in map) if (text.toLowerCase().includes(k)) return map[k];
        return null;
    }

    function extractTool(text) {
        if (/写作|写/.test(text)) return 'writer';
        if (/翻译/.test(text)) return 'translate';
        if (/分析/.test(text)) return 'analysis';
        if (/代码|编程|code/.test(text)) return 'code';
        if (/灵感|创意|点子/.test(text)) return 'idea';
        if (/总结|摘要/.test(text)) return 'summary';
        return null;
    }

    function executeCommand(cmd, text) {
        const [c, arg] = cmd.split(':');
        switch (c) {
            case 'clear':
                if (typeof clearChat !== 'undefined') clearChat.click();
                mavisSpeak('已清空当前对话。');
                break;
            case 'newchat':
                if (typeof newChatBtn !== 'undefined') newChatBtn.click();
                mavisSpeak('好的，已开启新对话。');
                break;
            case 'sidebar':
                if (typeof sidebarToggle !== 'undefined') sidebarToggle.click();
                mavisSpeak('侧边栏已切换。');
                break;
            case 'model':
                if (arg && typeof getModel === 'function' && getModel(arg)) {
                    chatSettings.model = arg; saveChatSettings(); syncModelSelector();
                    mavisSpeak('已切换到' + getModel(arg).name + '。');
                } else {
                    mavisSpeak('我听清了要换模型，但没认出具体哪个，我在面板里列出来了，你点一下就行。');
                }
                break;
            case 'summarize':
                mavisSummarize();
                break;
            case 'save':
                if (typeof saveConversations === 'function') saveConversations();
                mavisSpeak('对话已保存。');
                break;
            case 'theme':
                if (typeof themeToggle !== 'undefined') themeToggle.click();
                mavisSpeak('主题已切换。');
                break;
            case 'tool':
                if (arg && typeof openToolModal === 'function') { openToolModal(arg); mavisSpeak('已打开' + toolName(arg) + '工具。'); }
                else mavisSpeak('你想打开哪个工具？写作、翻译、分析、代码还是灵感？');
                break;
            case 'camera':
                toggleCamera();
                break;
            case 'top':
                window.scrollTo({ top: 0, behavior: 'smooth' });
                mavisSpeak('回到顶部了。');
                break;
            case 'bottom':
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                mavisSpeak('滚到底部了。');
                break;
            default:
                mavisChat(text);
        }
    }

    function toolName(t) {
        return ({ writer: '写作', translate: '翻译', analysis: '分析', code: '代码', idea: '灵感', summary: '总结' })[t] || '对应';
    }

    // =========================================================
    // 总结对话
    // =========================================================
    function mavisSummarize() {
        const conv = getActiveConversation();
        if (!conv || !conv.messages.length) { mavisSpeak('当前没有对话内容可以总结。'); return; }
        const transcript = conv.messages.map(m => (m.role === 'user' ? '用户' : '马维斯') + '：' + m.content).join('\n');
        const prompt = '请用要点形式（不超过6条）总结以下对话的核心内容，用中文：\n\n' + transcript;
        mavisSpeak('正在总结我们的对话…');
        // 借用主对话流（带马维斯人格由服务端/默认决定，这里直接走主流程即可）
        chatInput.value = prompt;
        if (typeof autoResizeTextarea === 'function') autoResizeTextarea(chatInput);
        if (typeof handleSendMessage === 'function') handleSendMessage();
        pollAndSpeak();
    }

    // =========================================================
    // 对话（带马维斯人格）
    // =========================================================
    function mavisChat(text) {
        ensureActiveConversation();
        const conv = getActiveConversation();
        addUserMessageToUI(text);
        conv.messages.push({ role: 'user', content: text });
        if (conv.title === '新对话' || !conv.title) {
            conv.title = text.length > 18 ? text.slice(0, 18) + '…' : text;
            if (typeof renderConversationList === 'function') renderConversationList();
        }
        if (typeof saveConversations === 'function') saveConversations();
        if (typeof chatInput !== 'undefined') { chatInput.value = ''; if (typeof autoResizeTextarea === 'function') autoResizeTextarea(chatInput); }

        const bubble = createStreamingBubble();
        let raw = '';
        isGenerating = true;
        if (typeof setStopUI === 'function') setStopUI(true);
        orb.classList.add('thinking');
        const model = chatSettings.model;

        const done = (msg) => {
            orb.classList.remove('thinking');
            if (msg) mavisSpeak(msg);
        };

        (async () => {
            try {
                let reply = '';
                const cb = (full) => { raw = full; updateStreamingBubble(bubble, raw); };
                if (model === '__custom__') {
                    // 服务端注入系统提示，这里把人格塞进用户消息
                    reply = await streamProxy(MAVIS_PERSONA + '\n\n用户原话：' + text, conv.messages.slice(0, -1), cb);
                } else if (model === 'pollinations' || model === 'pollinations-fast' || model === 'pollinations-deep') {
                    reply = await streamPollinations(conv.messages, cb, 'default', MAVIS_PERSONA);
                } else if (typeof puter !== 'undefined') {
                    const msgs = [{ role: 'system', content: MAVIS_PERSONA }]
                        .concat(conv.messages.slice(0, -1).map(m => ({ role: m.role, content: m.content })));
                    reply = await streamPuter(msgs, model === 'puter' ? 'gpt-5.5' : model, cb);
                } else {
                    reply = await streamPollinations(conv.messages, cb, 'default', MAVIS_PERSONA);
                }
                finalizeStreamingBubble(bubble, raw || reply || '');
                conv.messages.push({ role: 'assistant', content: raw || reply || '' });
                if (typeof saveConversations === 'function') saveConversations();
                done(raw || reply || '');
            } catch (err) {
                console.error('[mavis] 错误:', err);
                const msg = err.message || '出错了';
                if (err.name === 'AbortError' || stopRequested) {
                    finalizeStreamingBubble(bubble, raw || '（已停止）');
                    if (typeof saveConversations === 'function') saveConversations();
                    return;
                }
                if (/auth|login|401|unauthorized|token|API Key|权限|无效/i.test(msg)) {
                    const tip = '自定义后端鉴权失败，已自动切回免费直连；如要用自托管后端，请在「钥匙」里检查 API Key。';
                    if (typeof showErrorInBubble === 'function') showErrorInBubble(bubble, tip);
                    chatSettings.model = 'pollinations';
                    if (typeof saveChatSettings === 'function') saveChatSettings();
                    if (typeof syncModelSelector === 'function') syncModelSelector();
                    mavisSpeak('抱歉，后端钥匙不对，我切回免费直连了。');
                    return;
                }
                if (/402|429|rate|limit|pollinations|fetch|network|频繁|Queue/i.test(msg)) {
                    const tip = '免费通道暂时繁忙或受限，稍等几秒再问我。';
                    if (typeof showErrorInBubble === 'function') showErrorInBubble(bubble, tip);
                    else done(tip);
                    mavisSpeak('免费通道有点忙，稍等一下再问我。');
                    return;
                }
                if (typeof showErrorInBubble === 'function') showErrorInBubble(bubble, msg);
                else done(msg);
            } finally {
                isGenerating = false;
                if (typeof setStopUI === 'function') setStopUI(false);
            }
        })();
    }

    function pollAndSpeak() {
        let tries = 0;
        const iv = setInterval(() => {
            tries++;
            if (!isGenerating || tries > 150) {
                clearInterval(iv);
                if (tries > 150) return;
                const conv = getActiveConversation();
                const last = conv && conv.messages[conv.messages.length - 1];
                if (last && last.role === 'assistant' && last.content) mavisSpeak(last.content);
            }
        }, 400);
    }

    // =========================================================
    // 语音合成
    // =========================================================
    function mavisSpeak(text) {
        if (!synth || !text) return;
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        if (zhVoice) u.voice = zhVoice;
        u.lang = 'zh-CN'; u.rate = 1.05; u.pitch = 1.0;
        u.onstart = () => orb.classList.add('speaking');
        u.onend = () => orb.classList.remove('speaking');
        u.onerror = () => orb.classList.remove('speaking');
        synth.speak(u);
    }

    // =========================================================
    // 摄像头（多模态）
    // =========================================================
    async function toggleCamera() {
        if (mavisStream) { stopCamera(); return; }
        try {
            mavisStream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = mavisStream;
            cameraBox.style.display = 'block';
            camBtn.classList.add('active');
            setStatus('摄像头已开启，点「看一眼」让我描述画面');
        } catch (e) {
            setStatus('无法访问摄像头：' + (e.message || '权限被拒绝'));
        }
    }
    function stopCamera() {
        if (mavisStream) { mavisStream.getTracks().forEach(t => t.stop()); mavisStream = null; }
        cameraBox.style.display = 'none';
        camBtn.classList.remove('active');
    }
    function captureAndDescribe() {
        if (!mavisStream) return;
        const c = document.createElement('canvas');
        c.width = video.videoWidth || 640; c.height = video.videoHeight || 480;
        c.getContext('2d').drawImage(video, 0, 0);
        const dataUrl = c.toDataURL('image/jpeg', 0.8);
        mavisDescribeImage(dataUrl);
    }
    async function mavisDescribeImage(dataUrl) {
        mavisSpeak('让我看看…');
        setStatus('正在识别画面…');
        try {
            if (typeof puter !== 'undefined') {
                const resp = await puter.ai.chat([
                    { role: 'user', content: [
                        { type: 'text', text: '用一句中文描述你看到的画面。' },
                        { type: 'image_url', image_url: { url: dataUrl } }
                    ] }
                ], { model: 'gpt-4o', stream: false });
                const txt = (resp && resp.message && resp.message.content) || (typeof resp === 'string' ? resp : '');
                const out = (txt || '').toString().trim() || '我没看清画面。';
                setStatus(out);
                mavisSpeak(out);
            } else {
                mavisSpeak('视觉能力需要登录 Puter 才能用，请在主界面登录后再试。');
            }
        } catch (e) {
            mavisSpeak('视觉识别暂时不可用。');
        }
    }

    // 暴露给控制台调试
    window.MAVIS = { open: openMavis, close: closeMavis, speak: mavisSpeak };

    // 等 DOM 就绪后初始化
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMavis);
    else initMavis();
})();

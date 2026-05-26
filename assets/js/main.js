let newsData = null;

const CAT_NAMES = { '1': '大模型与基础技术', '2': 'AI 应用与产品', '3': '芯片与算力', '4': '具身智能与机器人' };
const CAT_CLASSES = ['cat1', 'cat2', 'cat3', 'cat4'];
const CATEGORIES = ['1', '2', '3', '4'];
let currentFilter = 'all';
let currentSearchQuery = '';

// ============ LLM Module ============
const LLM_STORAGE_KEY = 'ai_news_llm_config';
const LLM_SUMMARY_CACHE_KEY = 'ai_news_summary_cache_';

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getLLMConfig() {
    try {
        const saved = localStorage.getItem(LLM_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && Array.isArray(parsed.models)) return parsed;
            if (parsed && (parsed.provider || parsed.apiKey) && parsed.baseUrl && parsed.model) {
                localStorage.removeItem(LLM_STORAGE_KEY);
                const migrated = {
                    models: [{
                        id: generateId(),
                        name: parsed.provider || '已迁移模型',
                        model: parsed.model,
                        apiKey: parsed.apiKey,
                        baseUrl: parsed.baseUrl,
                        enabled: true,
                    }],
                    activeModelId: null,
                };
                migrated.activeModelId = migrated.models[0].id;
                saveLLMConfig(migrated);
                return migrated;
            }
            localStorage.removeItem(LLM_STORAGE_KEY);
        }
    } catch (e) {
        localStorage.removeItem(LLM_STORAGE_KEY);
    }
    return { models: [], activeModelId: null };
}

function saveLLMConfig(config) {
    localStorage.setItem(LLM_STORAGE_KEY, JSON.stringify(config));
}

function getActiveModel() {
    const cfg = getLLMConfig();
    if (!cfg.activeModelId || !cfg.models) return null;
    return cfg.models.find(m => m.id === cfg.activeModelId) || null;
}

function getEnabledModels() {
    const cfg = getLLMConfig();
    return (cfg.models || []).filter(m => m.enabled !== false);
}

function isLLMReady() {
    return getActiveModel() !== null;
}

async function doLLMRequest(url, headers, payload) {
    let res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload),
        });
    } catch (e) {
        throw new Error('CORS_OR_NETWORK:' + e.message);
    }
    if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error('API 错误 (' + res.status + '): ' + err.slice(0, 200));
    }
    const data = await res.json();
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('API 返回格式异常: ' + JSON.stringify(data).slice(0, 200));
    }
    return data.choices[0].message.content.trim();
}

async function callLLMWithModel(model, messages) {
    if (!model || !model.baseUrl || !model.apiKey || !model.model) {
        throw new Error('模型配置不完整');
    }
    const url = model.baseUrl.replace(/\/+$/, '') + '/chat/completions';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + model.apiKey,
    };
    const payload = {
        model: model.model,
        messages: messages,
        temperature: 0.3,
        max_tokens: 2000,
    };
    if (model.useProxy) {
        const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(url);
        return await doLLMRequest(proxyUrl, headers, payload);
    }
    try {
        return await doLLMRequest(url, headers, payload);
    } catch (e) {
        if (e.message.startsWith('CORS_OR_NETWORK:')) {
            const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(url);
            try {
                return await doLLMRequest(proxyUrl, headers, payload);
            } catch (proxyErr) {
                throw new Error('网络请求失败（直连和CORS代理均不可达）: ' + proxyErr.message);
            }
        }
        throw e;
    }
}

async function callLLM(messages) {
    const enabledModels = getEnabledModels();
    if (enabledModels.length === 0) throw new Error('请先配置 AI 模型');
    const activeModel = getActiveModel();
    const modelOrder = activeModel
        ? [activeModel, ...enabledModels.filter(m => m.id !== activeModel.id)]
        : enabledModels;
    const errors = [];
    for (const model of modelOrder) {
        try {
            const result = await callLLMWithModel(model, messages);
            const cfg = getLLMConfig();
            cfg.activeModelId = model.id;
            saveLLMConfig(cfg);
            return result;
        } catch (e) {
            errors.push(model.name + ': ' + e.message);
            console.warn('Model ' + model.name + ' failed, trying next...', e);
        }
    }
    throw new Error('所有模型均调用失败:\n' + errors.join('\n'));
}

async function testLLMConnection(model) {
    const result = await callLLMWithModel(model, [{ role: 'user', content: 'Say "OK" in one word.' }]);
    if (!result) throw new Error('空响应');
    return result;
}

async function llmTranslate(title, summary, detail) {
    const prompt = '将以下英文新闻翻译为中文，保持专业术语不变（如LLM、GPU、API等不翻译），输出格式：\n标题：翻译后的标题\n摘要：翻译后的摘要\n详情：翻译后的详情\n\n标题：' + title + '\n摘要：' + summary + '\n详情：' + (detail || summary);
    const result = await callLLM([{ role: 'user', content: prompt }]);
    const titleMatch = result.match(/标题[：:]\s*(.+)/);
    const summaryMatch = result.match(/摘要[：:]\s*(.+)/);
    const detailMatch = result.match(/详情[：:]\s*([\s\S]+?)(?:\n\n|$)/);
    return {
        title: titleMatch ? titleMatch[1].trim() : title,
        summary: summaryMatch ? summaryMatch[1].trim() : summary,
        detail: detailMatch ? detailMatch[1].trim() : (detail || summary),
    };
}

async function llmGenerateSummary(items, scopeLabel) {
    let context = '';
    if (scopeLabel === 'all') {
        for (let i = 1; i <= 4; i++) {
            const catItems = items['category' + i] || [];
            if (catItems.length === 0) continue;
            context += '\n## ' + CAT_NAMES[String(i)] + '\n';
            catItems.slice(0, 5).forEach((item, idx) => {
                context += (idx + 1) + '. ' + item.title + '：' + (item.summary || '') + '\n';
            });
        }
    } else {
        context += '\n## ' + CAT_NAMES[scopeLabel] + '\n';
        const catItems = items['category' + scopeLabel] || [];
        catItems.slice(0, 5).forEach((item, idx) => {
            context += (idx + 1) + '. ' + item.title + '：' + (item.summary || '') + '\n';
        });
    }
    const scopeText = scopeLabel === 'all' ? '今日全部' : CAT_NAMES[scopeLabel];
    const prompt = '你是AI新闻分析师。根据以下' + scopeText + 'AI新闻，生成一段"要点"摘要，要求：\n1. 用2-3段话总结最重要的AI动态\n2. 突出关键事件和趋势\n3. 语言简洁专业\n4. 用中文输出\n\n新闻内容：\n' + context;
    return await callLLM([{ role: 'user', content: prompt }]);
}

// ============ Settings UI ============
let settingsUIInitialized = false;

function initSettingsUI() {
    document.getElementById('settingsBtn').addEventListener('click', () => {
        renderSettingsModal();
        document.getElementById('settingsModal').classList.add('active');
    });
    document.getElementById('settingsClose').addEventListener('click', () => {
        document.getElementById('settingsModal').classList.remove('active');
    });
    document.getElementById('settingsModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) e.currentTarget.classList.remove('active');
    });
    settingsUIInitialized = true;
}

function renderSettingsModal() {
    const cfg = getLLMConfig();
    const models = cfg.models || [];
    const activeId = cfg.activeModelId;
    const container = document.getElementById('modelsContainer');
    if (!container) return;
    container.innerHTML = '';
    if (models.length === 0) {
        container.innerHTML = '<div class="model-empty">暂无模型配置，点击下方"添加模型"开始</div>';
    } else {
        models.forEach((model, index) => {
            const isActive = model.id === activeId;
            const el = document.createElement('div');
            el.className = 'model-card' + (isActive ? ' model-active' : '');
            el.innerHTML =
                '<div class="model-card-header">' +
                    '<span class="model-name">' + escapeHtml(model.name || '未命名模型') + '</span>' +
                    (isActive ? '<span class="model-badge">当前使用</span>' : '') +
                    '<div class="model-card-actions">' +
                        '<button class="model-btn model-switch-btn" data-id="' + model.id + '" title="切换为当前模型">' + (isActive ? '&#10003;' : '切换') + '</button>' +
                        '<button class="model-btn model-edit-btn" data-id="' + model.id + '" title="编辑">&#9998;</button>' +
                        '<button class="model-btn model-delete-btn" data-id="' + model.id + '" title="删除">&#10005;</button>' +
                    '</div>' +
                '</div>' +
                '<div class="model-card-info">' +
                    '<span>' + escapeHtml(model.model || '') + '</span>' +
                    '<span class="model-url">' + escapeHtml(model.baseUrl || '') + '</span>' +
                    (model.useProxy ? '<span class="model-proxy-tag">代理</span>' : '') +
                '</div>';
            container.appendChild(el);
        });
    }
    bindModelCardEvents();
}

function bindModelCardEvents() {
    document.querySelectorAll('.model-switch-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const cfg = getLLMConfig();
            cfg.activeModelId = id;
            saveLLMConfig(cfg);
            renderSettingsModal();
            showSettingsStatus('ok', '已切换模型');
        });
    });
    document.querySelectorAll('.model-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const cfg = getLLMConfig();
            const model = cfg.models.find(m => m.id === id);
            if (model) showModelEditor(model);
        });
    });
    document.querySelectorAll('.model-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const cfg = getLLMConfig();
            cfg.models = cfg.models.filter(m => m.id !== id);
            if (cfg.activeModelId === id) {
                cfg.activeModelId = cfg.models.length > 0 ? cfg.models[0].id : null;
            }
            saveLLMConfig(cfg);
            renderSettingsModal();
            showSettingsStatus('ok', '模型已删除');
        });
    });
}

function showModelEditor(model) {
    const editor = document.getElementById('modelEditor');
    if (!editor) return;
    editor.style.display = 'block';
    document.getElementById('editModelId').value = model ? model.id : '';
    document.getElementById('editModelName').value = model ? model.name : '';
    document.getElementById('editModelId2').value = model ? model.model : '';
    document.getElementById('editApiKey').value = model ? model.apiKey : '';
    document.getElementById('editBaseUrl').value = model ? model.baseUrl : '';
    document.getElementById('editModelEnabled').checked = model ? model.enabled !== false : true;
    document.getElementById('editUseProxy').checked = model ? !!model.useProxy : false;
    document.getElementById('editorTitle').textContent = model ? '编辑模型' : '添加模型';
    editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideModelEditor() {
    const editor = document.getElementById('modelEditor');
    if (editor) editor.style.display = 'none';
}

function initModelEditorEvents() {
    document.getElementById('addModelBtn').addEventListener('click', () => {
        showModelEditor(null);
    });
    document.getElementById('editorCancel').addEventListener('click', () => {
        hideModelEditor();
    });
    document.getElementById('editorSave').addEventListener('click', () => {
        try {
            const id = document.getElementById('editModelId').value;
            const name = document.getElementById('editModelName').value.trim();
            const modelId = document.getElementById('editModelId2').value.trim();
            const apiKey = document.getElementById('editApiKey').value.trim();
            const baseUrl = document.getElementById('editBaseUrl').value.trim().replace(/\/+$/, '');
            const enabled = document.getElementById('editModelEnabled').checked;
        const useProxy = document.getElementById('editUseProxy').checked;
            if (!name || !modelId || !apiKey || !baseUrl) {
                showSettingsStatus('err', '请填写所有必填字段');
                return;
            }
            const cfg = getLLMConfig();
            if (!cfg.models) cfg.models = [];
            if (id) {
                const idx = cfg.models.findIndex(m => m.id === id);
                if (idx >= 0) {
                    cfg.models[idx] = { id, name, model: modelId, apiKey, baseUrl, enabled, useProxy };
                } else {
                    cfg.models.push({ id: generateId(), name, model: modelId, apiKey, baseUrl, enabled, useProxy });
                    if (!cfg.activeModelId) cfg.activeModelId = cfg.models[cfg.models.length - 1].id;
                }
            } else {
                const newModel = { id: generateId(), name, model: modelId, apiKey, baseUrl, enabled, useProxy };
                cfg.models.push(newModel);
                if (!cfg.activeModelId) cfg.activeModelId = newModel.id;
            }
            saveLLMConfig(cfg);
            hideModelEditor();
            renderSettingsModal();
            showSettingsStatus('ok', id ? '模型已更新' : '模型已添加');
            if (newsData) renderNews(newsData);
        } catch (e) {
            console.error('Save failed:', e);
            showSettingsStatus('err', '保存失败: ' + e.message);
        }
    });
    document.getElementById('editorTest').addEventListener('click', async () => {
        try {
            const name = document.getElementById('editModelName').value.trim();
            const modelId = document.getElementById('editModelId2').value.trim();
            const apiKey = document.getElementById('editApiKey').value.trim();
            const baseUrl = document.getElementById('editBaseUrl').value.trim().replace(/\/+$/, '');
            if (!modelId || !apiKey || !baseUrl) {
                showSettingsStatus('err', '请先填写所有字段');
                return;
            }
            showSettingsStatus('', '正在测试连接...');
            await testLLMConnection({ name, model: modelId, apiKey, baseUrl, useProxy: document.getElementById('editUseProxy').checked });
            showSettingsStatus('ok', '连接成功！模型可用');
        } catch (e) {
            showSettingsStatus('err', '连接失败: ' + e.message);
        }
    });
}

function showSettingsStatus(type, msg) {
    const el = document.getElementById('settingsStatus');
    el.className = type;
    el.textContent = msg;
}

// ============ AI Summary ============
function initAISummary() {
    document.getElementById('aiSummaryBtn').addEventListener('click', async () => {
        if (!isLLMReady()) {
            document.getElementById('settingsBtn').click();
            return;
        }
        if (!newsData) return;
        showSummaryScopePicker();
    });
}

function showSummaryScopePicker() {
    const existing = document.getElementById('summaryScopePicker');
    if (existing) { existing.remove(); return; }
    const picker = document.createElement('div');
    picker.id = 'summaryScopePicker';
    picker.className = 'scope-picker';
    const activeCat = currentFilter !== 'all' ? currentFilter : null;
    let optionsHtml = '<button class="scope-btn" data-scope="all">全部新闻</button>';
    if (activeCat) {
        optionsHtml += '<button class="scope-btn" data-scope="' + activeCat + '">' + CAT_NAMES[activeCat] + '</button>';
    }
    for (let i = 1; i <= 4; i++) {
        if (String(i) !== activeCat) {
            optionsHtml += '<button class="scope-btn" data-scope="' + i + '">' + CAT_NAMES[String(i)] + '</button>';
        }
    }
    picker.innerHTML = '<div class="scope-picker-title">选择摘要范围</div><div class="scope-picker-options">' + optionsHtml + '</div>';
    document.getElementById('aiSummaryBtn').parentNode.insertBefore(picker, document.getElementById('aiSummaryBtn').nextSibling);
    picker.querySelectorAll('.scope-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const scope = btn.dataset.scope;
            picker.remove();
            generateAISummary(scope);
        });
    });
    setTimeout(() => {
        const closeHandler = (e) => {
            if (!picker.contains(e.target)) {
                picker.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        document.addEventListener('click', closeHandler);
    }, 0);
}

async function generateAISummary(scope) {
    const btn = document.getElementById('aiSummaryBtn');
    btn.disabled = true;
    btn.textContent = '生成中...';
    const box = document.getElementById('aiSummaryBox');
    const content = document.getElementById('aiSummaryContent');
    box.style.display = 'block';
    const cacheKey = LLM_SUMMARY_CACHE_KEY + newsData.date + '_' + scope;
    try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            content.innerHTML = '<div class="summary-text">' + formatSummary(cached) + '</div>';
            btn.disabled = false;
            btn.textContent = 'AI 要点';
            return;
        }
        content.innerHTML = '<div class="weekly-loading">AI 正在分析新闻...</div>';
        const summary = await llmGenerateSummary(newsData, scope);
        localStorage.setItem(cacheKey, summary);
        content.innerHTML = '<div class="summary-text">' + formatSummary(summary) + '</div>';
    } catch (e) {
        content.innerHTML = '<div class="news-empty">生成失败: ' + escapeHtml(e.message) + '</div>';
    }
    btn.disabled = false;
    btn.textContent = 'AI 要点';
}

function formatSummary(text) {
    return text.split('\n').filter(l => l.trim()).map(line => '<p>' + escapeHtml(line) + '</p>').join('');
}

// ============ Retranslate ============
async function retranslateItem(item, cardEl) {
    if (!isLLMReady()) {
        document.getElementById('settingsBtn').click();
        return;
    }
    const btn = cardEl.querySelector('.retranslate-btn');
    if (btn) { btn.textContent = '翻译中...'; btn.disabled = true; }
    try {
        const translated = await llmTranslate(item.title, item.summary, item.detail);
        item.title = translated.title;
        item.summary = translated.summary;
        item.detail = translated.detail;
        const h3 = cardEl.querySelector('h3');
        if (h3) {
            const btnHtml = isLLMReady() ? '<button class="retranslate-btn" title="用 AI 重新翻译">已翻译</button>' : '';
            h3.innerHTML = escapeHtml(translated.title) + btnHtml;
        }
        const summary = cardEl.querySelector('.summary');
        if (summary) summary.textContent = translated.summary;
    } catch (e) {
        const btn = cardEl.querySelector('.retranslate-btn');
        if (btn) { btn.textContent = '失败'; btn.disabled = false; }
        console.error('Retranslate failed:', e);
    }
}

// ============ Trend ============
const TREND_KEYWORDS = [
    'OpenAI', 'GPT', 'LLM', 'NVIDIA', 'GPU', 'Claude', 'Gemini', 'DeepSeek',
    'AI Agent', 'Robot', 'Humanoid', 'Chip', 'Tesla', 'Anthropic', 'Llama',
    'Autonomous', 'Embodied', 'Semiconductor', 'TSMC', 'Waymo',
];
const TREND_CACHE_KEY = 'ai_news_trend_cache_';

function initTrend() {
    document.getElementById('trendBtn').addEventListener('click', async () => {
        const box = document.getElementById('trendBox');
        if (box.style.display !== 'none') {
            box.style.display = 'none';
            return;
        }
        if (!newsData) return;
        const btn = document.getElementById('trendBtn');
        btn.disabled = true;
        btn.textContent = '加载中...';
        box.style.display = 'block';

        const content = document.getElementById('trendContent');
        const period = document.getElementById('trendPeriod');
        content.innerHTML = '<div class="trend-loading">正在加载历史数据...</div>';

        const BASE = 'https://raw.githubusercontent.com/zeonzeon123123123-png/ai-news/main/daily/';
        const now = new Date();
        let dates = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            dates.push(y + '-' + m + '-' + dd);
        }
        period.textContent = '(近 7 天)';

        const cacheKey = TREND_CACHE_KEY + dates[6] + '_' + dates[0];
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                renderTrend(JSON.parse(cached), content);
                btn.disabled = false;
                btn.textContent = '趋势';
                return;
            }
        } catch (e) {}

        let allItems = [];
        let loaded = 0;
        for (const dateStr of dates) {
            loaded++;
            try {
                let data = null;
                if (newsData && newsData.date === dateStr) {
                    data = newsData;
                } else {
                    const res = await fetch(BASE + dateStr + '.json');
                    if (res.ok) data = await res.json();
                }
                if (data) {
                    for (let i = 1; i <= 4; i++) {
                        const items = data['category' + i] || [];
                        items.forEach(item => {
                            allItems.push({ ...item, _cat: String(i) });
                        });
                    }
                }
            } catch (e) {}
            content.innerHTML = '<div class="trend-loading">正在加载... (' + loaded + '/' + dates.length + ')</div>';
        }

        const trendData = computeTrend(allItems);
        try { localStorage.setItem(cacheKey, JSON.stringify(trendData)); } catch (e) {}
        renderTrend(trendData, content);
        btn.disabled = false;
        btn.textContent = '趋势';
    });
}

function computeTrend(items) {
    const kwMap = {};
    items.forEach(item => {
        const text = ((item.title || '') + ' ' + (item.summary || '')).toLowerCase();
        TREND_KEYWORDS.forEach(kw => {
            if (text.includes(kw.toLowerCase())) {
                if (!kwMap[kw]) kwMap[kw] = { count: 0, score: 0, cats: new Set() };
                kwMap[kw].count++;
                kwMap[kw].score += (item.score || 0.7);
                kwMap[kw].cats.add(item._cat || '1');
            }
        });
    });
    const results = Object.entries(kwMap).map(([kw, data]) => ({
        keyword: kw,
        heat: data.count * 0.4 + data.score * 0.6,
        count: data.count,
        cats: Array.from(data.cats),
    }));
    results.sort((a, b) => b.heat - a.heat);
    return results.slice(0, 10);
}

function renderTrend(trendData, contentEl) {
    if (!trendData || trendData.length === 0) {
        contentEl.innerHTML = '<div class="news-empty">暂无足够数据生成趋势</div>';
        return;
    }
    const maxHeat = trendData[0].heat;
    let html = '';
    trendData.forEach(item => {
        const pct = Math.round((item.heat / maxHeat) * 100);
        const catClass = item.cats.length > 1 ? 'mix' : 'cat' + item.cats[0];
        html += '<div class="trend-item">' +
            '<span class="trend-keyword">' + escapeHtml(item.keyword) + '</span>' +
            '<div class="trend-bar-wrap"><div class="trend-bar ' + catClass + '" style="width:' + pct + '%"></div></div>' +
            '<span class="trend-score">' + item.count + '次</span>' +
        '</div>';
    });
    html += '<div class="trend-legend">' +
        '<span class="trend-legend-item"><span class="trend-legend-dot" style="background:#3a7bd5"></span>大模型</span>' +
        '<span class="trend-legend-item"><span class="trend-legend-dot" style="background:#f857a6"></span>AI应用</span>' +
        '<span class="trend-legend-item"><span class="trend-legend-dot" style="background:#f7971e"></span>芯片算力</span>' +
        '<span class="trend-legend-item"><span class="trend-legend-dot" style="background:#56ab2f"></span>具身智能</span>' +
        '<span class="trend-legend-item"><span class="trend-legend-dot" style="background:linear-gradient(90deg,#00d2ff,#f857a6)"></span>跨领域</span>' +
    '</div>';
    contentEl.innerHTML = html;
}

// ============ Core ============
async function loadNews() {
    showSkeleton();
    try {
        const res = await fetch('data/news.json');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        newsData = await res.json();
        renderNews(newsData);
    } catch (e) {
        console.error('Failed to load news:', e);
        showError();
    }
}

function showSkeleton() {
    CATEGORIES.forEach(cat => {
        const list = document.getElementById('grid' + cat);
        list.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            const sk = document.createElement('div');
            sk.className = 'skeleton-card';
            sk.innerHTML = '<div class="sk-idx"></div><div class="sk-body"><div class="sk-line sk-wide"></div><div class="sk-line sk-mid"></div><div class="sk-line sk-narrow"></div></div>';
            list.appendChild(sk);
        }
    });
}

function showError() {
    CATEGORIES.forEach(cat => {
        const list = document.getElementById('grid' + cat);
        list.innerHTML = '<div class="news-empty">加载失败 <button class="retry-btn" onclick="loadNews()">重试</button></div>';
    });
}

function renderNews(data) {
    CATEGORIES.forEach((cat, idx) => {
        const list = document.getElementById('grid' + cat);
        let items = data['category' + cat] || [];
        if (currentFilter !== 'all' && currentFilter !== cat) {
            document.getElementById('cat' + cat).style.display = 'none';
            return;
        }
        document.getElementById('cat' + cat).style.display = '';
        const countEl = document.getElementById('count' + cat);
        if (countEl) countEl.textContent = items.length + ' 条';
        list.innerHTML = '';
        if (items.length === 0) {
            list.innerHTML = '<div class="news-empty">暂无新闻</div>';
            return;
        }
        items.forEach((item, i) => {
            const card = document.createElement('div');
            card.className = 'news-card ' + CAT_CLASSES[idx];
            const highlightTitle = currentSearchQuery ? highlightText(escapeHtml(item.title), currentSearchQuery) : escapeHtml(item.title);
            const highlightSummary = currentSearchQuery ? highlightText(escapeHtml(item.summary), currentSearchQuery) : escapeHtml(item.summary);
            const retranslateBtn = isLLMReady() ? '<button class="retranslate-btn" title="用 AI 重新翻译">翻译</button>' : '';
            card.innerHTML =
                '<div class="idx">' + (i + 1) + '</div>' +
                '<div class="card-body">' +
                    '<h3>' + highlightTitle + retranslateBtn + '</h3>' +
                    '<p class="summary">' + highlightSummary + '</p>' +
                    '<div class="meta">' +
                        '<span class="source-tag">' + escapeHtml(item.source) + '</span>' +
                        '<span>' + escapeHtml(item.date) + '</span>' +
                    '</div>' +
                '</div>';
            card.addEventListener('click', (e) => {
                if (e.target.classList.contains('retranslate-btn')) {
                    e.stopPropagation();
                    retranslateItem(item, card);
                    return;
                }
                showDetail(item);
            });
            list.appendChild(card);
        });
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function highlightText(html, query) {
    if (!query) return html;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('(' + escaped + ')', 'gi');
    return html.replace(re, '<mark>$1</mark>');
}

function showDetail(item) {
    document.getElementById('modalTitle').textContent = item.title;
    document.getElementById('modalSource').textContent = item.source;
    document.getElementById('modalDate').textContent = item.date;
    document.getElementById('modalSummary').textContent = item.detail || item.summary;
    document.getElementById('modalLink').href = item.url;
    document.getElementById('detailModal').classList.add('active');
}

document.getElementById('modalClose').addEventListener('click', () => {
    document.getElementById('detailModal').classList.remove('active');
});
document.getElementById('detailModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('active');
});

document.getElementById('searchBtn').addEventListener('click', doSearch);
document.getElementById('searchInput').addEventListener('keyup', (e) => {
    if (e.key === 'Enter') doSearch();
    if (e.target.value === '') doSearch();
});

function doSearch() {
    const q = document.getElementById('searchInput').value.trim().toLowerCase();
    currentSearchQuery = q;
    if (!q) { renderNews(newsData); return; }
    const filtered = {};
    for (let i = 1; i <= 4; i++) {
        const key = 'category' + i;
        filtered[key] = (newsData[key] || []).filter(item =>
            (item.title || '').toLowerCase().includes(q) ||
            (item.summary || '').toLowerCase().includes(q) ||
            (item.source || '').toLowerCase().includes(q)
        );
    }
    renderNews(filtered);
    const total = Object.values(filtered).reduce((s, a) => s + a.length, 0);
    if (total === 0) {
        document.getElementById('grid1').innerHTML = '<div class="news-empty">未找到与 "' + escapeHtml(currentSearchQuery) + '" 相关的新闻</div>';
    }
}

function setupFilterTabs() {
    const tabs = document.querySelectorAll('.filter-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentFilter = tab.dataset.cat;
            renderNews(newsData);
        });
    });
}

document.getElementById('weeklyBtn').addEventListener('click', () => {
    document.getElementById('weeklyModal').classList.add('active');
});
document.getElementById('weeklyClose').addEventListener('click', () => {
    document.getElementById('weeklyModal').classList.remove('active');
});
document.getElementById('weeklyModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('active');
});

document.getElementById('weeklySubmit').addEventListener('click', async () => {
    const start = document.getElementById('weekStart').value;
    const end = document.getElementById('weekEnd').value;
    const cats = Array.from(document.querySelectorAll('.checkbox-group input:checked')).map(cb => cb.value);
    const count = parseInt(document.getElementById('weeklyCount').value) || 5;
    if (!start || !end) { alert('请选择日期范围'); return; }
    if (cats.length === 0) { alert('请至少选择一个板块'); return; }
    const resultEl = document.getElementById('weeklyResult');
    resultEl.style.display = 'block';
    resultEl.innerHTML = '<div class="weekly-loading">正在加载历史数据...</div>';

    const BASE = 'https://raw.githubusercontent.com/zeonzeon123123123-png/ai-news/main/daily/';

    let startDate = new Date(start);
    let endDate = new Date(end);
    let dates = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        let y = d.getFullYear();
        let m = String(d.getMonth() + 1).padStart(2, '0');
        let dd = String(d.getDate()).padStart(2, '0');
        dates.push(y + '-' + m + '-' + dd);
    }

    let allNews = { '1': [], '2': [], '3': [], '4': [] };
    let loaded = 0;
    let found = 0;

    for (let dateStr of dates) {
        loaded++;
        try {
            const res = await fetch(BASE + dateStr + '.json');
            if (res.ok) {
                const data = await res.json();
                found++;
                for (let i = 1; i <= 4; i++) {
                    let items = data['category' + i] || [];
                    for (let item of items) {
                        if (!allNews[String(i)].some(n => n.title === item.title)) {
                            allNews[String(i)].push(item);
                        }
                    }
                }
            }
        } catch (e) {}
        resultEl.innerHTML = '<div class="weekly-loading">正在加载... (' + loaded + '/' + dates.length + ') 已找到' + found + '天数据</div>';
    }

    if (newsData && newsData.date >= start && newsData.date <= end) {
        for (let i = 1; i <= 4; i++) {
            let items = newsData['category' + i] || [];
            for (let item of items) {
                if (!allNews[String(i)].some(n => n.title === item.title)) {
                    allNews[String(i)].push(item);
                }
            }
        }
    }

    if (found === 0 && (!newsData || newsData.date < start || newsData.date > end)) {
        resultEl.innerHTML = '<div class="news-empty">所选日期范围内没有找到历史数据。<br>目前可用数据日期：' + (newsData ? newsData.date : '无') + '</div>';
        return;
    }

    let mdReport = '# AI 新闻周报 - ' + start + ' 至 ' + end + '\n\n';
    let htmlParts = [];
    cats.forEach(cat => {
        const items = allNews[cat].slice(0, count);
        mdReport += '## 板块：' + CAT_NAMES[cat] + '\n\n';
        htmlParts.push('<div class="weekly-section"><h3>' + escapeHtml(CAT_NAMES[cat]) + '</h3>');
        if (items.length === 0) {
            mdReport += '暂无新闻\n\n';
            htmlParts.push('<div class="news-empty">暂无新闻</div></div>');
        } else {
            items.forEach((item, idx) => {
                mdReport += (idx + 1) + '. **' + item.title + '** - ' + item.url + '\n   ' + item.summary + '\n\n';
                htmlParts.push(
                    '<div class="weekly-item">' +
                        '<span class="weekly-idx">' + (idx + 1) + '</span>' +
                        '<div class="weekly-body">' +
                            '<a href="' + escapeHtml(item.url) + '" target="_blank" class="weekly-title">' + escapeHtml(item.title) + '</a>' +
                            '<p class="weekly-summary">' + escapeHtml(item.summary) + '</p>' +
                            '<span class="weekly-source">' + escapeHtml(item.source) + '</span>' +
                        '</div>' +
                    '</div>'
                );
            });
            htmlParts.push('</div>');
        }
    });
    htmlParts.push('<button class="copy-md-btn" onclick="copyWeeklyMd()">复制 Markdown</button>');
    resultEl.innerHTML = htmlParts.join('');
    window._weeklyMd = mdReport;
});

window.copyWeeklyMd = function() {
    if (window._weeklyMd) {
        navigator.clipboard.writeText(window._weeklyMd).then(() => {
            const btn = document.querySelector('.copy-md-btn');
            btn.textContent = '已复制';
            setTimeout(() => { btn.textContent = '复制 Markdown'; }, 2000);
        });
    }
};

function setCurrentDate() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const today = y + '-' + m + '-' + d;
    document.getElementById('currentDate').textContent = today + ' AI 新闻日报';
    document.getElementById('weekEnd').value = today;
    var weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    var wy = weekAgo.getFullYear();
    var wm = String(weekAgo.getMonth() + 1).padStart(2, '0');
    var wd = String(weekAgo.getDate()).padStart(2, '0');
    document.getElementById('weekStart').value = wy + '-' + wm + '-' + wd;
}

// ============ Calendar Picker ============
function CalendarPicker(inputEl, panelEl) {
    this.input = inputEl;
    this.panel = panelEl;
    this.currentYear = new Date().getFullYear();
    this.currentMonth = new Date().getMonth();
    this.selectedDate = null;
    this.isOpen = false;
    var self = this;
    this.input.addEventListener('click', function(e) {
        e.stopPropagation();
        if (self.isOpen) {
            self.close();
        } else {
            self.open();
        }
    });
    this.panel.addEventListener('click', function(e) {
        e.stopPropagation();
    });
    document.addEventListener('click', function() {
        self.close();
    });
}

CalendarPicker.prototype.open = function() {
    if (this.input.value) {
        var parts = this.input.value.split('-');
        if (parts.length === 3) {
            this.currentYear = parseInt(parts[0]);
            this.currentMonth = parseInt(parts[1]) - 1;
        }
    }
    this.render();
    this.panel.style.display = 'block';
    this.isOpen = true;
};

CalendarPicker.prototype.close = function() {
    this.panel.style.display = 'none';
    this.isOpen = false;
};

CalendarPicker.prototype.render = function() {
    var self = this;
    var year = this.currentYear;
    var month = this.currentMonth;
    var firstDay = new Date(year, month, 1).getDay();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var today = new Date();
    var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    var monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
    var html = '<div class="cal-header">';
    html += '<button class="cal-nav" data-dir="-1">&#9664;</button>';
    html += '<span class="cal-title">' + year + '年 ' + monthNames[month] + '</span>';
    html += '<button class="cal-nav" data-dir="1">&#9654;</button>';
    html += '</div>';
    html += '<div class="cal-weekdays">';
    var weekdays = ['日','一','二','三','四','五','六'];
    for (var i = 0; i < 7; i++) {
        html += '<span class="cal-wd">' + weekdays[i] + '</span>';
    }
    html += '</div>';
    html += '<div class="cal-days">';
    for (var i = 0; i < firstDay; i++) {
        html += '<span class="cal-day cal-empty"></span>';
    }
    for (var d = 1; d <= daysInMonth; d++) {
        var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        var classes = 'cal-day';
        if (dateStr === todayStr) classes += ' cal-today';
        if (dateStr === this.selectedDate) classes += ' cal-selected';
        if (dateStr > todayStr) classes += ' cal-future';
        html += '<span class="' + classes + '" data-date="' + dateStr + '">' + d + '</span>';
    }
    html += '</div>';
    this.panel.innerHTML = html;
    this.panel.querySelectorAll('.cal-nav').forEach(function(btn) {
        btn.addEventListener('click', function() {
            self.currentMonth += parseInt(this.dataset.dir);
            if (self.currentMonth > 11) { self.currentMonth = 0; self.currentYear++; }
            if (self.currentMonth < 0) { self.currentMonth = 11; self.currentYear--; }
            self.render();
        });
    });
    this.panel.querySelectorAll('.cal-day:not(.cal-empty):not(.cal-future)').forEach(function(dayEl) {
        dayEl.addEventListener('click', function() {
            self.selectedDate = this.dataset.date;
            self.input.value = this.dataset.date;
            self.close();
        });
    });
};

function initCalendarPickers() {
    new CalendarPicker(document.getElementById('weekStart'), document.getElementById('calendarStart'));
    new CalendarPicker(document.getElementById('weekEnd'), document.getElementById('calendarEnd'));
}

setupFilterTabs();
initSettingsUI();
initModelEditorEvents();
initAISummary();
initTrend();
initCalendarPickers();
setCurrentDate();
loadNews();
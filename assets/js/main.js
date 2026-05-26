let newsData = null;

const CAT_NAMES = { '1': '大模型与基础技术', '2': 'AI 应用与产品', '3': '芯片与算力', '4': '具身智能与机器人' };
const CAT_CLASSES = ['cat1', 'cat2', 'cat3', 'cat4'];
const CATEGORIES = ['1', '2', '3', '4'];
let currentFilter = 'all';
let currentSearchQuery = '';

// ============ LLM Module ============
const LLM_STORAGE_KEY = 'ai_news_llm_config';
const LLM_SUMMARY_CACHE_KEY = 'ai_news_summary_cache_';

const PROVIDER_DEFAULTS = {
    openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.0-flash' },
    deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    custom: { baseUrl: '', model: '' },
};

function getLLMConfig() {
    try {
        const saved = localStorage.getItem(LLM_STORAGE_KEY);
        if (saved) return JSON.parse(saved);
    } catch (e) {}
    return null;
}

function saveLLMConfig(config) {
    localStorage.setItem(LLM_STORAGE_KEY, JSON.stringify(config));
}

function isLLMReady() {
    const cfg = getLLMConfig();
    return cfg && cfg.apiKey && cfg.baseUrl && cfg.model;
}

async function callLLM(messages) {
    const cfg = getLLMConfig();
    if (!cfg) throw new Error('请先配置 AI 模型');

    if (cfg.provider === 'gemini') {
        return await callGemini(cfg, messages);
    }

    const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
    let res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + cfg.apiKey,
            },
            body: JSON.stringify({
                model: cfg.model,
                messages: messages,
                temperature: 0.3,
                max_tokens: 2000,
            }),
        });
    } catch (e) {
        throw new Error('网络请求失败，可能是 CORS 限制或 URL 不可达: ' + e.message);
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

async function callGemini(cfg, messages) {
    const url = cfg.baseUrl.replace(/\/+$/, '') + '/models/' + cfg.model + ':generateContent?key=' + cfg.apiKey;
    const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
    }));
    let res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: contents, generationConfig: { temperature: 0.3, maxOutputTokens: 2000 } }),
        });
    } catch (e) {
        throw new Error('网络请求失败，可能是 CORS 限制或 URL 不可达: ' + e.message);
    }
    if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error('Gemini API 错误 (' + res.status + '): ' + err.slice(0, 200));
    }
    const data = await res.json();
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
        throw new Error('Gemini API 返回格式异常: ' + JSON.stringify(data).slice(0, 200));
    }
    return data.candidates[0].content.parts[0].text.trim();
}

async function testLLMConnection() {
    const result = await callLLM([{ role: 'user', content: 'Say "OK" in one word.' }]);
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

async function llmGenerateSummary(allItems) {
    let context = '';
    for (let i = 1; i <= 4; i++) {
        const items = allItems['category' + i] || [];
        if (items.length === 0) continue;
        context += '\n## ' + CAT_NAMES[String(i)] + '\n';
        items.slice(0, 5).forEach((item, idx) => {
            context += (idx + 1) + '. ' + item.title + '：' + (item.summary || '') + '\n';
        });
    }
    const prompt = '你是AI新闻分析师。根据以下今日AI新闻，生成一段"今日要点"摘要，要求：\n1. 用2-3段话总结今天最重要的AI动态\n2. 突出跨领域趋势和关键事件\n3. 语言简洁专业\n4. 用中文输出\n\n今日新闻：\n' + context;
    return await callLLM([{ role: 'user', content: prompt }]);
}

// ============ Settings UI ============
let settingsUIInitialized = false;

function initSettingsUI() {
    document.getElementById('llmProvider').addEventListener('change', (e) => {
        applyProviderDefaults(e.target.value);
    });
    document.getElementById('settingsBtn').addEventListener('click', () => {
        loadConfigToForm();
        document.getElementById('settingsModal').classList.add('active');
    });
    document.getElementById('settingsClose').addEventListener('click', () => {
        document.getElementById('settingsModal').classList.remove('active');
    });
    document.getElementById('settingsModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) e.currentTarget.classList.remove('active');
    });
    document.getElementById('settingsSave').addEventListener('click', () => {
        const config = readConfigFromForm();
        if (!config.apiKey || !config.baseUrl || !config.model) {
            showSettingsStatus('err', '请填写所有必填字段');
            return;
        }
        saveLLMConfig(config);
        showSettingsStatus('ok', '配置已保存');
    });
    document.getElementById('settingsTest').addEventListener('click', async () => {
        const config = readConfigFromForm();
        if (!config.apiKey || !config.baseUrl || !config.model) {
            showSettingsStatus('err', '请先填写所有字段');
            return;
        }
        saveLLMConfig(config);
        showSettingsStatus('', '正在测试连接...');
        try {
            await testLLMConnection();
            showSettingsStatus('ok', '连接成功！模型可用');
        } catch (e) {
            showSettingsStatus('err', '连接失败: ' + e.message);
        }
    });
    settingsUIInitialized = true;
}

function loadConfigToForm() {
    const cfg = getLLMConfig();
    if (cfg) {
        document.getElementById('llmProvider').value = cfg.provider || 'openai';
        document.getElementById('llmModel').value = cfg.model || '';
        document.getElementById('llmApiKey').value = cfg.apiKey || '';
        document.getElementById('llmBaseUrl').value = cfg.baseUrl || '';
    } else {
        applyProviderDefaults('openai');
    }
    document.getElementById('settingsStatus').textContent = '';
    document.getElementById('settingsStatus').className = '';
}

function readConfigFromForm() {
    return {
        provider: document.getElementById('llmProvider').value,
        model: document.getElementById('llmModel').value.trim(),
        apiKey: document.getElementById('llmApiKey').value.trim(),
        baseUrl: document.getElementById('llmBaseUrl').value.trim().replace(/\/+$/, ''),
    };
}

function applyProviderDefaults(provider) {
    const defaults = PROVIDER_DEFAULTS[provider] || {};
    document.getElementById('llmBaseUrl').value = defaults.baseUrl || '';
    document.getElementById('llmModel').value = defaults.model || '';
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
        const btn = document.getElementById('aiSummaryBtn');
        btn.disabled = true;
        btn.textContent = '生成中...';
        const box = document.getElementById('aiSummaryBox');
        const content = document.getElementById('aiSummaryContent');
        box.style.display = 'block';
        const cacheKey = LLM_SUMMARY_CACHE_KEY + newsData.date;
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                content.innerHTML = '<div class="summary-text">' + formatSummary(cached) + '</div>';
                btn.disabled = false;
                btn.textContent = 'AI 要点';
                return;
            }
            content.innerHTML = '<div class="weekly-loading">AI 正在分析今日新闻...</div>';
            const summary = await llmGenerateSummary(newsData);
            localStorage.setItem(cacheKey, summary);
            content.innerHTML = '<div class="summary-text">' + formatSummary(summary) + '</div>';
        } catch (e) {
            content.innerHTML = '<div class="news-empty">生成失败: ' + escapeHtml(e.message) + '</div>';
        }
        btn.disabled = false;
        btn.textContent = 'AI 要点';
    });
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
    document.getElementById('weekStart').max = today;
    document.getElementById('weekEnd').max = today;
    document.getElementById('weekEnd').value = today;
    var weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    var wy = weekAgo.getFullYear();
    var wm = String(weekAgo.getMonth() + 1).padStart(2, '0');
    var wd = String(weekAgo.getDate()).padStart(2, '0');
    document.getElementById('weekStart').value = wy + '-' + wm + '-' + wd;
}

setupFilterTabs();
initSettingsUI();
initAISummary();
initTrend();
setCurrentDate();
loadNews();
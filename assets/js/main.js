let newsData = null;

const CAT_NAMES = { '1': '大模型与基础技术', '2': 'AI 应用与产品', '3': '芯片与算力', '4': '具身智能与机器人' };
const CAT_CLASSES = ['cat1', 'cat2', 'cat3', 'cat4'];
const CATEGORIES = ['1', '2', '3', '4'];
let currentFilter = 'all';

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
            card.innerHTML =
                '<div class="idx">' + (i + 1) + '</div>' +
                '<div class="card-body">' +
                    '<h3>' + highlightTitle + '</h3>' +
                    '<p class="summary">' + highlightSummary + '</p>' +
                    '<div class="meta">' +
                        '<span class="source-tag">' + escapeHtml(item.source) + '</span>' +
                        '<span>' + escapeHtml(item.date) + '</span>' +
                    '</div>' +
                '</div>';
            card.addEventListener('click', () => showDetail(item));
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

let currentSearchQuery = '';

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
setCurrentDate();
loadNews();
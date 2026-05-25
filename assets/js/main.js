let newsData = null;

async function loadNews() {
    try {
        const res = await fetch('data/news.json');
        newsData = await res.json();
        renderNews(newsData);
    } catch (e) {
        console.error('Failed to load news:', e);
        document.querySelectorAll('.news-list').forEach(g => {
            g.innerHTML = '<div class="news-empty">加载失败，请稍后重试</div>';
        });
    }
}

function renderNews(data) {
    const categories = ['1', '2', '3', '4'];
    const catClasses = ['cat1', 'cat2', 'cat3', 'cat4'];
    categories.forEach((cat, idx) => {
        const list = document.getElementById('grid' + cat);
        const items = data['category' + cat] || [];
        const countEl = document.getElementById('count' + cat);
        if (countEl) countEl.textContent = items.length + ' 条';
        list.innerHTML = '';
        if (items.length === 0) {
            list.innerHTML = '<div class="news-empty">暂无新闻</div>';
            return;
        }
        items.forEach((item, i) => {
            const card = document.createElement('div');
            card.className = 'news-card ' + catClasses[idx];
            card.innerHTML =
                '<div class="idx">' + (i + 1) + '</div>' +
                '<div class="card-body">' +
                    '<h3>' + escapeHtml(item.title) + '</h3>' +
                    '<p class="summary">' + escapeHtml(item.summary) + '</p>' +
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
});

function doSearch() {
    const q = document.getElementById('searchInput').value.trim().toLowerCase();
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
    resultEl.textContent = '正在加载历史数据...';

    const catNames = { '1': '大模型与基础技术', '2': 'AI 应用与产品', '3': '芯片与算力', '4': '具身智能与机器人' };
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
        resultEl.textContent = '正在加载... (' + loaded + '/' + dates.length + ') 已找到' + found + '天数据';
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
        resultEl.textContent = '所选日期范围内没有找到历史数据。\n\n目前可用数据日期：' + (newsData ? newsData.date : '无');
        return;
    }

    let report = '# AI 新闻周报 - ' + start + ' 至 ' + end + '\n\n';
    cats.forEach(cat => {
        report += '## 板块：' + catNames[cat] + '\n\n';
        const items = allNews[cat].slice(0, count);
        if (items.length === 0) {
            report += '暂无新闻\n\n';
        } else {
            items.forEach((item, idx) => {
                report += (idx + 1) + '. **' + item.title + '** - ' + item.url + '\n   ' + item.summary + '\n\n';
            });
        }
    });
    resultEl.textContent = report;
});

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

setCurrentDate();
loadNews();
let newsData = null;

async function loadNews() {
    try {
        const res = await fetch('data/news.json');
        newsData = await res.json();
        renderNews(newsData);
    } catch (e) {
        console.error('Failed to load news:', e);
        document.querySelectorAll('.news-grid').forEach(g => {
            g.innerHTML = '<p class="error">Failed to load news data</p>';
        });
    }
}

function renderNews(data) {
    const categories = ['1', '2', '3', '4'];
    const catClasses = ['cat1', 'cat2', 'cat3', 'cat4'];
    categories.forEach((cat, idx) => {
        const grid = document.getElementById('grid' + cat);
        const items = data['category' + cat] || [];
        grid.innerHTML = '';
        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'news-card ' + catClasses[idx];
            card.innerHTML = '<h3>' + escapeHtml(item.title) + '</h3><p class="summary">' + escapeHtml(item.summary) + '</p><div class="meta"><span>' + escapeHtml(item.source) + '</span><span>' + escapeHtml(item.date) + '</span></div>';
            card.addEventListener('click', () => showDetail(item));
            grid.appendChild(card);
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

document.getElementById('weeklySubmit').addEventListener('click', () => {
    const start = document.getElementById('weekStart').value;
    const end = document.getElementById('weekEnd').value;
    const cats = Array.from(document.querySelectorAll('.checkbox-group input:checked')).map(cb => cb.value);
    const count = parseInt(document.getElementById('weeklyCount').value) || 5;
    if (!start || !end) { alert('Please select date range'); return; }
    if (cats.length === 0) { alert('Please select at least one category'); return; }
    const resultEl = document.getElementById('weeklyResult');
    resultEl.style.display = 'block';
    resultEl.textContent = 'Generating weekly report...';
    const catNames = { '1': '大模型与基础技术', '2': 'AI 应用与产品', '3': '芯片与算力', '4': '具身智能与机器人' };
    let report = '# AI 新闻周报 - ' + start + ' 至 ' + end + '\n\n';
    cats.forEach(cat => {
        report += '## 板块：' + catNames[cat] + '\n\n';
        const items = (newsData['category' + cat] || []).slice(0, count);
        if (items.length === 0) {
            report += 'No news found.\n\n';
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
    document.getElementById('currentDate').textContent = y + '-' + m + '-' + d + ' AI 新闻日报';
}

setCurrentDate();
loadNews();
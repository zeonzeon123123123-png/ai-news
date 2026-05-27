import json
import os
import requests
from datetime import datetime, timedelta, timezone

BJ_TZ = timezone(timedelta(hours=8))

CATEGORY_NAMES = {
    "1": "大模型与基础技术",
    "2": "AI 应用与产品",
    "3": "芯片与算力",
    "4": "具身智能与机器人",
}

LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "")
LLM_MODEL = os.environ.get("LLM_MODEL", "")


def llm_generate_summary(data):
    if not LLM_API_KEY or not LLM_BASE_URL or not LLM_MODEL:
        return None
    try:
        context = ""
        for i in range(1, 5):
            items = data.get(f"category{i}", [])
            if not items:
                continue
            context += f"\n## {CATEGORY_NAMES[str(i)]}\n"
            for idx, item in enumerate(items[:5], 1):
                context += f"{idx}. {item.get('title', '')}：{item.get('summary', '')}\n"
        prompt = (
            "你是AI新闻分析师。根据以下今日AI新闻，生成一段摘要，要求：\n"
            "1. 用2-3段话总结今天最重要的AI动态\n"
            "2. 突出跨领域趋势和关键事件\n"
            "3. 语言简洁专业\n"
            "4. 用中文输出\n\n"
            f"今日新闻：\n{context}"
        )
        url = LLM_BASE_URL.rstrip("/") + "/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {LLM_API_KEY}",
        }
        payload = {
            "model": LLM_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3,
            "max_tokens": 2000,
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=120)
        resp.raise_for_status()
        result = resp.json()
        return result["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"LLM summary generation failed: {e}")
        return None


def generate_daily_report():
    try:
        with open("data/news.json", "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        print("No news.json found")
        return

    now = datetime.now(BJ_TZ)
    today_cn = f"{now.year}年{now.month}月{now.day}日"
    date_str = now.strftime("%Y-%m-%d")

    if LLM_API_KEY and LLM_BASE_URL and LLM_MODEL:
        print("Generating AI summary via LLM...")
        summary = llm_generate_summary(data)
        if summary:
            data["ai_summary"] = summary
            print("AI summary generated successfully")
        else:
            print("AI summary generation failed, skipped")

    report = f"# AI 新闻日报 - {today_cn}\n\n"
    if data.get("ai_summary"):
        report += "## AI 今日要点\n\n" + data["ai_summary"] + "\n\n"

    for i in range(1, 5):
        cat_key = f"category{i}"
        items = data.get(cat_key, [])
        nums = ["一", "二", "三", "四"]
        report += f"## 板块{nums[i-1]}：{CATEGORY_NAMES[str(i)]}\n\n"
        if not items:
            report += "暂无新闻\n\n"
        else:
            for idx, item in enumerate(items, 1):
                title = item.get("title", "")
                url = item.get("url", "")
                summary = item.get("summary", "")[:30]
                report += f"{idx}. **{title}** - {url}\n   {summary}\n\n"

    os.makedirs("daily", exist_ok=True)
    with open(f"daily/{date_str}.md", "w", encoding="utf-8") as f:
        f.write(report)

    with open(f"daily/{date_str}.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    with open(f"daily/{date_str}.html", "w", encoding="utf-8") as f:
        f.write(generate_daily_html(data, date_str, today_cn))

    with open("daily/index.html", "w", encoding="utf-8") as f:
        f.write(generate_archive_page())

    print(f"Daily report generated: daily/{date_str}.md")


def generate_daily_html(data, date_str, date_cn):
    cat_colors = {
        "1": "#00d2ff",
        "2": "#f857a6",
        "3": "#f7971e",
        "4": "#56ab2f",
    }
    cat_icons = {
        "1": "&#x1F9E0;",
        "2": "&#x1F4F1;",
        "3": "&#x1F4BB;",
        "4": "&#x1F916;",
    }
    cat_names = CATEGORY_NAMES

    cards_html = ""
    for i in range(1, 5):
        items = data.get(f"category{i}", [])
        cards_html += f'<h2 style="color:{cat_colors[str(i)]}">{cat_icons[str(i)]} 板块{"一二三四"[i-1]}：{cat_names[str(i)]}</h2>\n'
        if not items:
            cards_html += '<p style="color:#666">暂无新闻</p>\n'
        else:
            for idx, item in enumerate(items, 1):
                title = item.get("title", "")
                url = item.get("url", "")
                summary = item.get("summary", "")
                source = item.get("source", "")
                cards_html += f'''<div class="card">
  <div class="card-head"><span class="idx">{idx}</span><a href="{url}" target="_blank">{title}</a></div>
  <div class="card-body">{summary}</div>
  <div class="card-meta">{source}</div>
</div>\n'''

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI 新闻日报 - {date_cn}</title>
<style>
body{{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0a0a1a;color:#e0e0e0;max-width:800px;margin:0 auto;padding:2rem}}
h1{{background:linear-gradient(90deg,#00d2ff,#3a7bd5);-webkit-background-clip:text;-webkit-text-fill-color:transparent}}
h2{{margin-top:2rem;padding-bottom:0.5rem;border-bottom:2px solid #3a7bd5}}
a{{color:#00d2ff;text-decoration:none}}a:hover{{text-decoration:underline}}
.back{{display:inline-block;margin-bottom:2rem;padding:0.5rem 1rem;background:#3a7bd5;color:#fff;border-radius:6px}}
.card{{background:#1a1a2e;border:1px solid #2a2a4a;border-radius:8px;padding:1rem;margin:0.5rem 0}}
.card-head{{font-size:1rem;margin-bottom:0.3rem}}
.idx{{display:inline-block;background:#3a7bd5;color:#fff;width:1.5rem;height:1.5rem;border-radius:50%;text-align:center;line-height:1.5rem;margin-right:0.5rem;font-size:0.8rem}}
.card-body{{font-size:0.85rem;color:#a0a0b0}}
.card-meta{{font-size:0.75rem;color:#666;margin-top:0.3rem}}
.date{{color:#888;font-size:0.9rem;margin-bottom:1rem}}
</style>
</head>
<body>
<h1>AI 新闻日报</h1>
<div class="date">{date_cn}</div>
<a class="back" href="index.html">返回历史列表</a>
<a class="back" href="../" style="margin-left:0.5rem">返回首页</a>
{cards_html}
</body>
</html>"""


def generate_archive_page():
    return """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI News - 历史日报</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0a0a1a;color:#e0e0e0;max-width:800px;margin:0 auto;padding:2rem}
h1{background:linear-gradient(90deg,#00d2ff,#3a7bd5);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
a{color:#00d2ff;text-decoration:none}a:hover{text-decoration:underline}
.item{background:#1a1a2e;border:1px solid #2a2a4a;border-radius:8px;padding:1rem;margin:0.5rem 0;display:flex;align-items:center;gap:1rem}
.item .date-label{font-size:1.1rem;font-weight:600}
.item .links{display:flex;gap:0.5rem;font-size:0.85rem}
.back{display:inline-block;margin-bottom:2rem;padding:0.5rem 1rem;background:#3a7bd5;color:#fff;border-radius:6px}
</style>
</head>
<body>
<h1>历史日报</h1>
<a class="back" href="../">返回首页</a>
<div id="list"></div>
<script>
fetch('https://api.github.com/repos/zeonzeon123123123-png/ai-news/contents/daily')
.then(r=>r.json())
.then(files=>{
  const htmls=files.filter(f=>f.name.endsWith('.html')&&f.name!=='index.html').sort((a,b)=>b.name.localeCompare(a.name));
  document.getElementById('list').innerHTML=htmls.map(f=>{
    const date=f.name.replace('.html','');
    const base=f.download_url.replace(f.name,'');
    return '<div class="item"><span class="date-label">'+date+'</span><div class="links"><a href="'+f.download_url+'">HTML版</a></div></div>';
  }).join('');
});
</script>
</body>
</html>"""


if __name__ == "__main__":
    generate_daily_report()
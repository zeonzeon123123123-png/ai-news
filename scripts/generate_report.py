import json
import os
from datetime import datetime

CATEGORY_NAMES = {
    "1": "大模型与基础技术",
    "2": "AI 应用与产品",
    "3": "芯片与算力",
    "4": "具身智能与机器人",
}


def generate_daily_report():
    try:
        with open("data/news.json", "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        print("No news.json found")
        return

    today = datetime.now().strftime("%Y年%-m月%-d日")
    report = f"# AI 新闻日报 - {today}\n\n"

    for i in range(1, 5):
        cat_key = f"category{i}"
        items = data.get(cat_key, [])
        report += f"## 板块{chr(0xFF11 + i - 1)}：{CATEGORY_NAMES[str(i)]}\n\n"
        if not items:
            report += "暂无新闻\n\n"
        else:
            for idx, item in enumerate(items, 1):
                title = item.get("title", "")
                url = item.get("url", "")
                summary = item.get("summary", "")[:30]
                report += f"{idx}. **{title}** - {url}\n   {summary}\n\n"

    os.makedirs("daily", exist_ok=True)
    date_str = datetime.now().strftime("%Y-%m-%d")
    with open(f"daily/{date_str}.md", "w", encoding="utf-8") as f:
        f.write(report)

    with open("daily/index.html", "w", encoding="utf-8") as f:
        f.write(generate_archive_page())

    print(f"Daily report generated: daily/{date_str}.md")


def generate_archive_page():
    html = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI News - 历史日报</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0a0a1a;color:#e0e0e0;max-width:800px;margin:0 auto;padding:2rem}
h1{background:linear-gradient(90deg,#00d2ff,#3a7bd5);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
a{color:#00d2ff;text-decoration:none}a:hover{text-decoration:underline}
.item{background:#1a1a2e;border:1px solid #2a2a4a;border-radius:8px;padding:1rem;margin:0.5rem 0}
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
  const md=files.filter(f=>f.name.endsWith('.md')).sort((a,b)=>b.name.localeCompare(a.name));
  document.getElementById('list').innerHTML=md.map(f=>'<div class="item"><a href="'+f.download_url+'">'+f.name.replace('.md','')+'</a></div>').join('');
});
</script>
</body>
</html>"""
    return html


if __name__ == "__main__":
    generate_daily_report()
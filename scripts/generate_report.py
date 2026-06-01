import json
import os
import re
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
    date_str = data.get("date", now.strftime("%Y-%m-%d"))
    try:
        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
        today_cn = f"{date_obj.year}年{date_obj.month}月{date_obj.day}日"
    except ValueError:
        today_cn = date_str

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
                summary = item.get("summary", "")[:120]
                report += f"{idx}. **{title}** - {url}\n   {summary}\n\n"

    os.makedirs("daily", exist_ok=True)

    existing_json_path = f"daily/{date_str}.json"
    if os.path.exists(existing_json_path):
        try:
            with open(existing_json_path, "r", encoding="utf-8") as f:
                existing = json.load(f)
            existing_count = sum(len(existing.get(f"category{i}", [])) for i in range(1, 5))
            new_count = sum(len(data.get(f"category{i}", [])) for i in range(1, 5))
            if existing_count >= new_count:
                print(f"Daily report for {date_str} already exists with {existing_count} items (>= {new_count}), skipping overwrite")
                with open("daily/index.html", "w", encoding="utf-8") as f:
                    f.write(generate_archive_page())
                return
        except Exception:
            pass

    clean_data = {k: v for k, v in data.items() if k != "short_summary"}
    for cat_key in ["category1", "category2", "category3", "category4"]:
        if cat_key in clean_data:
            clean_data[cat_key] = [
                {k: v for k, v in item.items() if k != "short_summary"}
                for item in clean_data[cat_key]
            ]

    with open(f"daily/{date_str}.md", "w", encoding="utf-8") as f:
        f.write(report)

    with open(f"daily/{date_str}.json", "w", encoding="utf-8") as f:
        json.dump(clean_data, f, ensure_ascii=False, indent=2)

    with open(f"daily/{date_str}.html", "w", encoding="utf-8") as f:
        f.write(generate_daily_html(clean_data, date_str, today_cn))

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
    cat_names = CATEGORY_NAMES

    sections_html = ""
    for i in range(1, 5):
        items = data.get(f"category{i}", [])
        sections_html += f'<div class="section">\n<h2 style="color:{cat_colors[str(i)]}">板块{"一二三四"[i-1]}：{cat_names[str(i)]}</h2>\n'
        if not items:
            sections_html += '<p class="empty">暂无新闻</p>\n'
        else:
            for idx, item in enumerate(items, 1):
                title = item.get("title", "")
                url = item.get("url", "")
                summary = item.get("summary", "")
                sections_html += f'<div class="news-item">\n<div class="news-title">{idx}. {title}</div>\n<div class="news-summary">{summary}</div>\n<a class="news-link" href="{url}" target="_blank">阅读原文</a>\n</div>\n'
        sections_html += '</div>\n'

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI 新闻日报 - {date_cn}</title>
<style>
body{{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0a0a1a;color:#e0e0e0;max-width:800px;margin:0 auto;padding:2rem}}
h1{{background:linear-gradient(90deg,#00d2ff,#3a7bd5);-webkit-background-clip:text;-webkit-text-fill-color:transparent}}
a{{color:#00d2ff;text-decoration:none}}a:hover{{text-decoration:underline}}
.back{{display:inline-block;margin-bottom:2rem;padding:0.5rem 1rem;background:#3a7bd5;color:#fff;border-radius:6px}}
.date{{color:#888;font-size:0.9rem;margin-bottom:1rem}}
.section{{margin-bottom:2rem}}
.section h2{{margin-bottom:0.8rem;padding-bottom:0.5rem;border-bottom:2px solid #3a7bd5}}
.news-item{{padding:0.8rem 0;border-bottom:1px solid #2a2a4a}}
.news-title{{font-size:1rem;font-weight:600;color:#e0e0e0;margin-bottom:0.3rem;line-height:1.5}}
.news-summary{{font-size:0.88rem;color:#a0a0b0;line-height:1.6;margin-bottom:0.3rem}}
.news-link{{font-size:0.82rem}}
.empty{{color:#666;padding:1rem 0}}
</style>
</head>
<body>
<h1>AI 新闻日报</h1>
<div class="date">{date_cn}</div>
<a class="back" href="index.html">返回历史列表</a>
<a class="back" href="../" style="margin-left:0.5rem">返回首页</a>
{sections_html}
</body>
</html>"""


def generate_archive_page():
    import glob
    daily_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "daily")
    date_map = {}
    for f in os.listdir(daily_dir):
        m = re.match(r"^(\d{4}-\d{2}-\d{2})\.(html|md|json)$", f)
        if m:
            d, ext = m.group(1), m.group(2)
            if ext != "json":
                if d not in date_map:
                    date_map[d] = {"html": False, "md": False}
                if ext == "html":
                    date_map[d]["html"] = True
                if ext == "md":
                    date_map[d]["md"] = True
    dates = sorted(date_map.keys(), reverse=True)
    items_html = ""
    base = "https://zeonzeon123123123-png.github.io/ai-news/daily/"
    for d in dates:
        links = date_map[d]
        html_link = '<a href="' + base + d + '.html">HTML版</a>' if links["html"] else ""
        md_link = '<a href="' + base + d + '.md">Markdown版</a>' if links["md"] else ""
        items_html += '<div class="item"><span class="date-label">' + d + '</span><div class="links">' + html_link + md_link + '</div></div>\n'
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
""" + items_html + """
</body>
</html>"""


if __name__ == "__main__":
    generate_daily_report()
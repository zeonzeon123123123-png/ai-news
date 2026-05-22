import feedparser
import json
import os
import re
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
import requests

RSS_SOURCES = {
    "1": [
        {"name": "ArXiv CS.AI", "url": "http://arxiv.org/rss/cs.AI", "source": "ArXiv"},
        {"name": "ArXiv CS.CL", "url": "http://arxiv.org/rss/cs.CL", "source": "ArXiv"},
        {"name": "MIT Tech Review AI", "url": "https://www.technologyreview.com/feed/", "source": "MIT Tech Review"},
        {"name": "VentureBeat AI", "url": "https://venturebeat.com/category/ai/feed/", "source": "VentureBeat"},
    ],
    "2": [
        {"name": "The Verge AI", "url": "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", "source": "The Verge"},
        {"name": "TechCrunch AI", "url": "https://techcrunch.com/category/artificial-intelligence/feed/", "source": "TechCrunch"},
        {"name": "Wired AI", "url": "https://www.wired.com/feed/tag/ai/latest/rss", "source": "Wired"},
    ],
    "3": [
        {"name": "AnandTech", "url": "https://www.anandtech.com/rss/", "source": "AnandTech"},
        {"name": "Tom's Hardware", "url": "https://www.tomshardware.com/feeds/all", "source": "Tom's Hardware"},
        {"name": "Semiconductor Engineering", "url": "https://semiengineering.com/feed/", "source": "SemiEngineering"},
    ],
    "4": [
        {"name": "IEEE Spectrum Robotics", "url": "https://spectrum.ieee.org/robotics/feed", "source": "IEEE Spectrum"},
        {"name": "The Robot Report", "url": "https://www.therobotreport.com/feed/", "source": "The Robot Report"},
        {"name": "TechCrunch Robotics", "url": "https://techcrunch.com/category/robotics/feed/", "source": "TechCrunch"},
    ],
}

KEYWORDS = {
    "1": ["llm", "gpt", "claude", "gemini", "llama", "model", "transformer", "diffusion", "foundation model",
          "training", "fine-tuning", "rlhf", "alignment", "大模型", "基础模型", "训练", "微调", "openai", "deepseek",
          "deepmind", "anthropic", "mistral", "qwen", "通义", "文心", "智谱"],
    "2": ["copilot", "chatbot", "assistant", "agent", "ai app", "ai product", "generative", "midjourney",
          "stable diffusion", "sora", "ai tool", "ai platform", "ai应用", "ai产品", "智能助手", "ai办公",
          "notion ai", "cursor", "ai编程", "ai写作", "ai绘画"],
    "3": ["gpu", "chip", "nvidia", "amd", "tpu", "inference", "compute", "semiconductor", "hbm", "gpu",
          "chiplet", "asic", "fpga", "算力", "芯片", "gpu", "ai加速", "h100", "h200", "b200", "昇腾",
          "寒武纪", "台积电", "tsmc", "intel", "qualcomm"],
    "4": ["robot", "humanoid", "embodied", "autonomous", "self-driving", "waymo", "tesla bot", "optimus",
          "atlas", "boston dynamics", "figure", "具身智能", "机器人", "人形", "自动驾驶", "无人驾驶",
          "walker", "ubtech", "agility", "digit"],
}

def fetch_rss(url, source_name):
    items = []
    try:
        feed = feedparser.parse(url)
        for entry in feed.entries[:20]:
            title = entry.get("title", "")
            link = entry.get("link", "")
            summary = ""
            if entry.get("summary"):
                soup = BeautifulSoup(entry.summary, "html.parser")
                summary = soup.get_text()[:200]
            pub_date = ""
            if entry.get("published"):
                try:
                    parsed = datetime(*entry.published_parsed[:6])
                    pub_date = parsed.strftime("%Y-%m-%d")
                except:
                    pub_date = datetime.now().strftime("%Y-%m-%d")
            else:
                pub_date = datetime.now().strftime("%Y-%m-%d")
            items.append({
                "title": title,
                "url": link,
                "summary": summary[:60],
                "detail": summary,
                "source": source_name,
                "date": pub_date,
            })
    except Exception as e:
        print(f"Error fetching {url}: {e}")
    return items


def classify_news(items):
    classified = {"1": [], "2": [], "3": [], "4": []}
    for item in items:
        text = (item["title"] + " " + item["summary"]).lower()
        scores = {}
        for cat, keywords in KEYWORDS.items():
            score = sum(1 for kw in keywords if kw.lower() in text)
            scores[cat] = score
        best_cat = max(scores, key=scores.get)
        if scores[best_cat] > 0:
            classified[best_cat].append(item)
    return classified


def select_top_news(classified, per_category=5):
    today = datetime.now().strftime("%Y-%m-%d")
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    for cat in classified:
        recent = [n for n in classified[cat] if n["date"] in [today, yesterday]]
        if len(recent) < per_category:
            recent = classified[cat][:per_category]
        classified[cat] = recent[:per_category]
    return classified


def main():
    all_items = []
    for cat, sources in RSS_SOURCES.items():
        for src in sources:
            items = fetch_rss(src["url"], src["source"])
            all_items.extend(items)

    classified = classify_news(all_items)
    selected = select_top_news(classified, 5)

    result = {"date": datetime.now().strftime("%Y-%m-%d")}
    for i in range(1, 5):
        cat_key = str(i)
        result[f"category{i}"] = selected[cat_key]

    os.makedirs("data", exist_ok=True)
    with open("data/news.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"News updated: {sum(len(v) for v in result.values() if isinstance(v, list))} items")


if __name__ == "__main__":
    main()
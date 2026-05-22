import feedparser
import requests
import json
import os
import re
import time
import unicodedata
from datetime import datetime, timedelta
from bs4 import BeautifulSoup

RSS_SOURCES = {
    "1": [
        {"url": "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", "source": "The Verge"},
        {"url": "https://techcrunch.com/category/artificial-intelligence/feed/", "source": "TechCrunch"},
        {"url": "https://www.wired.com/feed/tag/ai/latest/rss", "source": "Wired"},
        {"url": "https://venturebeat.com/category/ai/feed/", "source": "VentureBeat"},
        {"url": "https://www.technologyreview.com/feed/", "source": "MIT Tech Review"},
    ],
    "2": [
        {"url": "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", "source": "The Verge"},
        {"url": "https://techcrunch.com/category/artificial-intelligence/feed/", "source": "TechCrunch"},
        {"url": "https://www.wired.com/feed/tag/ai/latest/rss", "source": "Wired"},
        {"url": "https://venturebeat.com/category/ai/feed/", "source": "VentureBeat"},
        {"url": "https://www.technologyreview.com/feed/", "source": "MIT Tech Review"},
    ],
    "3": [
        {"url": "https://www.tomshardware.com/feeds/all", "source": "Tom's Hardware"},
        {"url": "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", "source": "The Verge"},
        {"url": "https://techcrunch.com/category/artificial-intelligence/feed/", "source": "TechCrunch"},
        {"url": "https://www.wired.com/feed/tag/ai/latest/rss", "source": "Wired"},
    ],
    "4": [
        {"url": "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", "source": "The Verge"},
        {"url": "https://techcrunch.com/category/artificial-intelligence/feed/", "source": "TechCrunch"},
        {"url": "https://www.wired.com/feed/tag/ai/latest/rss", "source": "Wired"},
        {"url": "https://venturebeat.com/category/ai/feed/", "source": "VentureBeat"},
        {"url": "https://www.tomshardware.com/feeds/all", "source": "Tom's Hardware"},
        {"url": "https://www.technologyreview.com/feed/", "source": "MIT Tech Review"},
        {"url": "https://www.newscientist.com/subject/technology/feed/", "source": "New Scientist"},
        {"url": "https://arstechnica.com/feed/", "source": "Ars Technica"},
        {"url": "https://www.wired.com/feed/rss", "source": "Wired"},
    ],
}

KEYWORDS = {
    "1": ["llm", "gpt", "claude", "gemini", "llama", "model", "transformer", "diffusion", "foundation",
          "training", "fine-tuning", "rlhf", "alignment", "deepseek", "deepmind", "anthropic", "mistral",
          "qwen", "openai", "large language", "neural network", "bert", "parameters", "checkpoint",
          "agi", "reasoning", "inference", "multimodal", "language model", "ai model"],
    "2": ["copilot", "chatbot", "assistant", "agent", "ai app", "ai product", "generative", "midjourney",
          "stable diffusion", "sora", "ai tool", "ai platform", "ai-powered", "notion ai", "cursor",
          "coding assistant", "ai feature", "ai integration", "launches ai", "announces ai",
          "ai therapy", "audiobook", "podcast", "spotify", "elevenlabs", "ai avatar", "ai clone"],
    "3": ["gpu", "chip", "nvidia", "amd", "tpu", "compute", "semiconductor", "hbm",
          "asic", "fpga", "accelerat", "processor", "data center", "foundry", "tsmc",
          "intel", "qualcomm", "epyc", "venice", "2nm", "3nm", "fabrication", "smuggling",
          "super micro", "broadcom", "mtia", "server shipment", "production ramp"],
    "4": ["robot", "humanoid", "embodied", "autonomous driving", "self-driving", "waymo", "optimus",
          "atlas", "boston dynamics", "figure ai", "bipedal", "manipulation", "locomotion",
          "walker", "ubtech", "agility", "digit", "autonomous vehicle", "lidar",
          "drone", "tesla bot", "3d print", "iot", "sensor",
          "autonomous", "mobility", "hardware", "device",
          "ai-powered", "ai-driven", "smart", "intelligent", "neural", "deep learning"],
}

EXCLUDE_KEYWORDS = {
    "3": ["gaming laptop", "gaming pc", "discount", "sale", "save $", "coupon",
          "gaming chair", "memorial day", "gaming monitor", "ssd", "hard drive",
          "chromebook", "deal on", "best buy", "newegg"],
    "4": ["crypto", "bitcoin", "etf", "funeral", "chromebook", "gaming chair",
          "gaming monitor", "memorial day", "discount", "best buy", "newegg"],
}

def is_chinese(text):
    if not text:
        return False
    count = 0
    for ch in text:
        if '\u4e00' <= ch <= '\u9fff':
            count += 1
    return count / max(len(text), 1) > 0.1

def translate_to_chinese(text):
    if not text or is_chinese(text):
        return text
    for attempt in range(3):
        try:
            from deep_translator import GoogleTranslator
            result = GoogleTranslator(source='en', target='zh-CN').translate(text)
            if result and result != text:
                return result
        except Exception as e:
            print(f"    Translation retry {attempt+1}: {e}")
            time.sleep(1)
    return text

def validate_url(url, timeout=10):
    try:
        resp = requests.head(url, timeout=timeout, allow_redirects=True)
        return resp.status_code == 200
    except:
        try:
            resp = requests.get(url, timeout=timeout, allow_redirects=True, stream=True)
            resp.close()
            return resp.status_code == 200
        except:
            return False

def classify_item(title, summary):
    text = (title + " " + summary).lower()
    scores = {}
    for cat, keywords in KEYWORDS.items():
        score = sum(1 for kw in keywords if kw.lower() in text)
        scores[cat] = score
    if max(scores.values()) == 0:
        return None
    best_cat = max(scores, key=scores.get)
    if best_cat in EXCLUDE_KEYWORDS:
        for excl in EXCLUDE_KEYWORDS[best_cat]:
            if excl.lower() in text:
                scores[best_cat] = max(0, scores[best_cat] - 5)
        best_cat = max(scores, key=scores.get)
    return best_cat

def fetch_rss(url, source_name):
    items = []
    try:
        feed = feedparser.parse(url)
        for entry in feed.entries[:30]:
            title = entry.get("title", "").strip()
            link = entry.get("link", "").strip()
            if not title or not link:
                continue
            summary = ""
            if entry.get("summary"):
                soup = BeautifulSoup(entry.summary, "html.parser")
                summary = soup.get_text()[:300].strip()
            pub_date = datetime.now().strftime("%Y-%m-%d")
            if entry.get("published_parsed"):
                try:
                    parsed = datetime(*entry.published_parsed[:6])
                    if (datetime.now() - parsed).days > 7:
                        continue
                    pub_date = parsed.strftime("%Y-%m-%d")
                except:
                    pass
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

def main():
    print("Fetching RSS feeds...")
    all_items = []
    for cat, sources in RSS_SOURCES.items():
        for src in sources:
            items = fetch_rss(src["url"], src["source"])
            print(f"  {src['source']}: {len(items)} items")
            for item in items:
                classified_cat = classify_item(item["title"], item["summary"])
                if classified_cat:
                    item["_cat"] = classified_cat
                    all_items.append(item)

    classified = {"1": [], "2": [], "3": [], "4": []}
    for item in all_items:
        cat = item.pop("_cat")
        seen_titles = {n["title"] for n in classified[cat]}
        if item["title"] not in seen_titles:
            classified[cat].append(item)

    for cat in classified:
        classified[cat].sort(key=lambda x: x["date"], reverse=True)

    print("\nValidating URLs and translating...")
    result = {"date": datetime.now().strftime("%Y-%m-%d")}
    used_titles = set()
    for i in range(1, 5):
        cat_key = str(i)
        valid_items = []
        candidates = classified[cat_key]
        print(f"  Category {i}: {len(candidates)} candidates, validating...")
        for item in candidates:
            if len(valid_items) >= 5:
                break
            url = item["url"]
            print(f"    Checking: {url[:80]}...", end=" ")
            if validate_url(url):
                if not is_chinese(item["title"]):
                    print("OK, translating...", end=" ")
                    item["title"] = translate_to_chinese(item["title"])
                    item["summary"] = translate_to_chinese(item["summary"])
                    item["detail"] = translate_to_chinese(item["detail"])
                    time.sleep(0.5)
                    print("done")
                else:
                    print("OK (Chinese)")
                valid_items.append(item)
                used_titles.add(item["title"])
            else:
                print("FAILED")
        if len(valid_items) < 5:
            print(f"  Category {i} only has {len(valid_items)} items, supplementing from other categories...")
            all_candidates = []
            for other_cat in classified:
                for item in classified[other_cat]:
                    if item["title"] not in used_titles and item not in valid_items:
                        all_candidates.append(item)
            all_candidates.sort(key=lambda x: x["date"], reverse=True)
            for item in all_candidates:
                if len(valid_items) >= 5:
                    break
                url = item["url"]
                print(f"    Supplement: {url[:80]}...", end=" ")
                if validate_url(url):
                    if not is_chinese(item["title"]):
                        print("OK, translating...", end=" ")
                        item["title"] = translate_to_chinese(item["title"])
                        item["summary"] = translate_to_chinese(item["summary"])
                        item["detail"] = translate_to_chinese(item["detail"])
                        time.sleep(0.5)
                        print("done")
                    else:
                        print("OK (Chinese)")
                    valid_items.append(item)
                    used_titles.add(item["title"])
                else:
                    print("FAILED")
        result[f"category{i}"] = valid_items
        print(f"  Category {i}: {len(valid_items)} valid items")

    os.makedirs("data", exist_ok=True)
    with open("data/news.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    total = sum(len(result.get(f"category{i}", [])) for i in range(1, 5))
    print(f"\nDone! Total: {total} validated news items")


if __name__ == "__main__":
    main()
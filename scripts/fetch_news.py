import feedparser
import requests
import json
import os
import re
import time
from datetime import datetime, timedelta
from bs4 import BeautifulSoup

RSS_SOURCES = [
    {"url": "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", "source": "The Verge", "authority": 0.9},
    {"url": "https://techcrunch.com/category/artificial-intelligence/feed/", "source": "TechCrunch", "authority": 0.95},
    {"url": "https://www.wired.com/feed/tag/ai/latest/rss", "source": "Wired", "authority": 0.85},
    {"url": "https://venturebeat.com/category/ai/feed/", "source": "VentureBeat", "authority": 0.8},
    {"url": "https://www.technologyreview.com/feed/", "source": "MIT Tech Review", "authority": 0.9},
    {"url": "https://www.tomshardware.com/feeds/all", "source": "Tom's Hardware", "authority": 0.7},
    {"url": "https://www.newscientist.com/subject/technology/feed/", "source": "New Scientist", "authority": 0.75},
    {"url": "https://arstechnica.com/feed/", "source": "Ars Technica", "authority": 0.8},
    {"url": "https://www.wired.com/feed/rss", "source": "Wired", "authority": 0.85},
    {"url": "https://www.theverge.com/rss/index.xml", "source": "The Verge", "authority": 0.85},
    {"url": "https://techcrunch.com/feed/", "source": "TechCrunch", "authority": 0.9},
    {"url": "https://www.theverge.com/rss/tech/index.xml", "source": "The Verge", "authority": 0.85},
    {"url": "https://arstechnica.com/tag/ai/feed/", "source": "Ars Technica", "authority": 0.85},
    {"url": "https://feeds.feedburner.com/ruanyifeng", "source": "Ruan Yifeng", "authority": 0.75},
    {"url": "https://36kr.com/feed", "source": "36Kr", "authority": 0.85},
    {"url": "https://www.jiqizhixin.com/rss", "source": "Jiqizhixin", "authority": 0.85},
    {"url": "https://www.ithome.com/rss/", "source": "ITHome", "authority": 0.75},
]

CATEGORY_KEYWORDS = {
    "1": {
        "core": ["llm", "gpt", "claude", "gemini", "llama", "openai", "anthropic", "deepmind",
                 "deepseek", "mistral", "qwen", "language model", "foundation model",
                 "transformer", "diffusion model", "agi", "multimodal model",
                 "大模型", "基础模型", "语言模型", "通用人工智能", "深度学习"],
        "secondary": ["model", "training", "fine-tuning", "rlhf", "alignment", "neural network",
                      "bert", "parameters", "checkpoint", "reasoning", "inference",
                      "large language", "ai model", "generative model",
                      "训练", "微调", "推理", "参数", "对齐"],
    },
    "2": {
        "core": ["copilot", "chatbot", "ai agent", "ai assistant", "ai-powered app",
                 "ai product launch", "midjourney", "sora", "ai coding", "ai tool launch",
                 "elevenlabs", "ai avatar", "ai clone",
                 "AI应用", "AI产品", "智能助手", "AI编程", "AI写作", "AI绘画"],
        "secondary": ["ai app", "ai product", "ai platform", "ai tool", "ai-powered",
                      "ai feature", "ai integration", "generative ai app", "ai writing",
                      "ai art", "ai music", "ai video", "ai therapy", "ai audiobook",
                      "podcast ai", "spotify ai", "cursor", "notion ai",
                      "智能办公", "AI办公", "AI工具"],
    },
    "3": {
        "core": ["gpu", "nvidia gpu", "ai chip", "tpu", "ai accelerator", "h100", "h200", "b200",
                 "ai semiconductor", "ai asic", "epyc", "data center ai", "ai server",
                 "chip manufacturing", "tsmc ai",
                 "AI芯片", "算力", "GPU", "芯片制造", "智算中心", "国产芯片"],
        "secondary": ["nvidia", "amd", "chip", "semiconductor", "hbm", "asic", "fpga",
                      "processor", "foundry", "tsmc", "intel", "broadcom", "mtia",
                      "server shipment", "production ramp", "2nm", "3nm", "fabrication",
                      "compute", "super micro", "smuggling",
                      "半导体", "台积电", "英伟达", "昇腾", "寒武纪"],
    },
    "4": {
        "core": ["robot", "humanoid robot", "embodied ai", "self-driving car", "autonomous vehicle",
                 "waymo", "tesla bot", "optimus robot", "atlas robot", "boston dynamics",
                 "figure ai", "delivery robot", "surgical robot", "drone ai",
                 "机器人", "人形机器人", "具身智能", "自动驾驶", "无人驾驶", "特斯拉机器人"],
        "secondary": ["humanoid", "autonomous driving", "bipedal", "manipulation",
                      "locomotion", "walker robot", "ubtech", "agility robotics",
                      "autonomous", "lidar", "robotic arm", "industrial robot",
                      "service robot", "smart hardware", "iot device",
                      "优必选", "机械臂", "服务机器人", "工业机器人", "激光雷达"],
    },
}

INDUSTRY_KEYWORDS = [
    "openai", "google", "microsoft", "meta", "nvidia", "amd", "apple", "amazon",
    "anthropic", "deepmind", "tesla", "baidu", "alibaba", "bytedance", "huawei",
    "billion", "million", "funding", "series a", "series b", "ipo", "valuation",
    "regulation", "policy", "ban", "restrict", "export", "law", "legislation",
    "breakthrough", "first", "record", "milestone", "launches", "announces",
    "partnership", "acquisition", "deal", "contract", "investment",
    "融资", "上市", "突破", "首次", "发布", "合作", "收购", "投资", "政策", "禁令", "限制",
    "十亿", "亿", "美元",
]

NOISE_KEYWORDS = [
    "discount", "sale", "save $", "coupon", "deal on", "best buy", "newegg",
    "gaming chair", "gaming monitor", "gaming laptop", "gaming pc", "memorial day",
    "black friday", "prime day", "review:", "hands-on:", "unboxing",
    "chromebook", "smart ring", "smart watch", "fitness tracker",
    "crypto", "bitcoin", "nft", "etf", "funeral",
    "ssd deal", "hard drive deal", "monitor deal",
]

SOURCE_AUTHORITY = {
    "TechCrunch": 0.95,
    "MIT Tech Review": 0.9,
    "The Verge": 0.9,
    "Wired": 0.85,
    "36Kr": 0.85,
    "Jiqizhixin": 0.85,
    "Ars Technica": 0.8,
    "VentureBeat": 0.8,
    "New Scientist": 0.75,
    "ITHome": 0.75,
    "Ruan Yifeng": 0.75,
    "Tom's Hardware": 0.7,
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
            time.sleep(2)
    return text


def validate_url(url, timeout=15):
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    try:
        resp = requests.get(url, timeout=timeout, allow_redirects=True, stream=True, headers=headers)
        resp.close()
        return resp.status_code == 200
    except:
        pass
    return False


def classify_item(title, summary):
    text = (title + " " + summary).lower()
    scores = {}
    for cat, kw_groups in CATEGORY_KEYWORDS.items():
        core_hits = sum(2 for kw in kw_groups["core"] if kw.lower() in text)
        secondary_hits = sum(1 for kw in kw_groups["secondary"] if kw.lower() in text)
        scores[cat] = core_hits + secondary_hits
    if max(scores.values()) == 0:
        return None
    return max(scores, key=scores.get)


def score_relevance(item, cat):
    text = (item["title"] + " " + item["summary"]).lower()
    kw_groups = CATEGORY_KEYWORDS.get(cat, {})
    core_hits = sum(1 for kw in kw_groups.get("core", []) if kw.lower() in text)
    secondary_hits = sum(1 for kw in kw_groups.get("secondary", []) if kw.lower() in text)
    if core_hits >= 3:
        return 1.0
    elif core_hits == 2:
        return 0.95
    elif core_hits == 1:
        if secondary_hits >= 2:
            return 0.9
        elif secondary_hits == 1:
            return 0.85
        else:
            return 0.7
    elif secondary_hits >= 3:
        return 0.7
    elif secondary_hits == 2:
        return 0.55
    elif secondary_hits == 1:
        return 0.4
    return 0


def score_industry_impact(item):
    text = (item["title"] + " " + item["summary"]).lower()
    hits = sum(1 for kw in INDUSTRY_KEYWORDS if kw.lower() in text)
    if hits >= 5:
        return 1.0
    elif hits >= 4:
        return 0.95
    elif hits >= 3:
        return 0.85
    elif hits >= 2:
        return 0.75
    elif hits >= 1:
        return 0.6
    return 0.3


def score_content_depth(item):
    detail_len = len(item.get("detail", ""))
    if detail_len > 300:
        return 1.0
    elif detail_len > 200:
        return 0.9
    elif detail_len > 150:
        return 0.8
    elif detail_len > 100:
        return 0.7
    elif detail_len > 50:
        return 0.5
    return 0.3


def score_timeliness(item):
    try:
        pub = datetime.strptime(item["date"], "%Y-%m-%d")
        hours_old = (datetime.now() - pub).total_seconds() / 3600
    except:
        hours_old = 48
    if hours_old <= 24:
        return 1.0
    elif hours_old <= 48:
        return 0.7
    elif hours_old <= 72:
        return 0.4
    return 0.1


def score_source(item):
    return SOURCE_AUTHORITY.get(item.get("source", ""), 0.5)


def has_noise(item):
    text = (item["title"] + " " + item["summary"]).lower()
    return any(nk.lower() in text for nk in NOISE_KEYWORDS)


def compute_final_score(item, cat):
    if has_noise(item):
        return 0
    relevance = score_relevance(item, cat)
    if relevance < 0.4:
        return 0
    impact = score_industry_impact(item)
    depth = score_content_depth(item)
    timeliness = score_timeliness(item)
    source = score_source(item)
    final = (relevance * 0.30 + impact * 0.25 + depth * 0.20 + timeliness * 0.15 + source * 0.10)
    return round(final, 4)


SCORE_THRESHOLD = 0.7


def is_similar(title1, title2, threshold=0.5):
    words1 = set(title1.lower().split())
    words2 = set(title2.lower().split())
    if not words1 or not words2:
        return False
    overlap = len(words1 & words2) / min(len(words1), len(words2))
    return overlap > threshold


def fetch_rss(url, source_name, authority):
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
                summary = soup.get_text()[:500].strip()
            pub_date = datetime.now().strftime("%Y-%m-%d")
            has_valid_date = False
            if entry.get("published_parsed"):
                try:
                    parsed = datetime(*entry.published_parsed[:6])
                    age_hours = (datetime.now() - parsed).total_seconds() / 3600
                    if age_hours > 48:
                        continue
                    pub_date = parsed.strftime("%Y-%m-%d")
                    has_valid_date = True
                except:
                    pass
            if not has_valid_date:
                if entry.get("updated_parsed"):
                    try:
                        parsed = datetime(*entry.updated_parsed[:6])
                        age_hours = (datetime.now() - parsed).total_seconds() / 3600
                        if age_hours > 48:
                            continue
                        pub_date = parsed.strftime("%Y-%m-%d")
                        has_valid_date = True
                    except:
                        pass
            items.append({
                "title": title,
                "url": link,
                "summary": summary[:60],
                "detail": summary,
                "source": source_name,
                "source_authority": authority,
                "date": pub_date,
            })
    except Exception as e:
        print(f"  Error fetching {url}: {e}")
    return items


def main():
    print("Fetching RSS feeds...")
    all_items = []
    for src in RSS_SOURCES:
        items = fetch_rss(src["url"], src["source"], src.get("authority", 0.7))
        print(f"  {src['source']}: {len(items)} items")
        all_items.extend(items)

    print(f"\nTotal raw items: {len(all_items)}")

    seen_urls = set()
    unique_items = []
    for item in all_items:
        if item["url"] not in seen_urls:
            seen_urls.add(item["url"])
            unique_items.append(item)

    print(f"After URL dedup: {len(unique_items)}")

    classified = {"1": [], "2": [], "3": [], "4": []}
    for item in unique_items:
        cat = classify_item(item["title"], item["summary"])
        if cat:
            score = compute_final_score(item, cat)
            item["_cat"] = cat
            item["_score"] = score
            if score >= SCORE_THRESHOLD:
                classified[cat].append(item)

    for cat in classified:
        classified[cat].sort(key=lambda x: x.get("_score", 0), reverse=True)
        classified[cat] = deduplicate_titles(classified[cat])
        print(f"  Category {cat}: {len(classified[cat])} items above {SCORE_THRESHOLD} (top score: {classified[cat][0]['_score'] if classified[cat] else 0})")

    print("\nValidating URLs and translating...")
    result = {"date": datetime.now().strftime("%Y-%m-%d")}
    used_titles = set()
    used_urls = set()

    for i in range(1, 5):
        cat_key = str(i)
        valid_items = []
        source_count = {}
        candidates = classified[cat_key]

        for item in candidates:
            if len(valid_items) >= 5:
                break
            src = item.get("source", "")
            if source_count.get(src, 0) >= 3:
                continue
            if item["url"] in used_urls:
                continue

            url = item["url"]
            score = item.get("_score", 0)
            print(f"  [{score:.2f}] {url[:70]}...", end=" ")

            if validate_url(url):
                if not is_chinese(item["title"]):
                    print("OK trans...", end=" ")
                    item["title"] = translate_to_chinese(item["title"])
                    item["summary"] = translate_to_chinese(item["summary"])
                    item["detail"] = translate_to_chinese(item["detail"])
                    time.sleep(0.5)
                    print("done")
                else:
                    print("OK")
                clean_item = {k: v for k, v in item.items() if not k.startswith("_")}
                valid_items.append(clean_item)
                used_titles.add(item["title"])
                used_urls.add(item["url"])
                source_count[src] = source_count.get(src, 0) + 1
            else:
                print("FAILED")

        if len(valid_items) < 5:
            print(f"  Category {i} needs {5 - len(valid_items)} more, supplementing from all scored items...")
            pool = []
            all_scored = []
            for item_candidate in unique_items:
                c = classify_item(item_candidate["title"], item_candidate["summary"])
                if not c:
                    continue
                sc = compute_final_score(item_candidate, c)
                if sc < SCORE_THRESHOLD:
                    continue
                if item_candidate["url"] in used_urls and c != cat_key:
                    continue
                item_candidate["_cat"] = c
                item_candidate["_score"] = sc
                all_scored.append(item_candidate)
            seen = set()
            for p in all_scored:
                if p["url"] not in seen:
                    seen.add(p["url"])
                    pool.append(p)
            pool.sort(key=lambda x: x.get("_score", 0), reverse=True)
            pool = deduplicate_titles(pool)
            for item in pool:
                if len(valid_items) >= 5:
                    break
                src = item.get("source", "")
                if source_count.get(src, 0) >= 4:
                    continue
                url = item["url"]
                score = item.get("_score", 0)
                print(f"  [sup {score:.2f}] {url[:70]}...", end=" ")
                if validate_url(url):
                    if not is_chinese(item["title"]):
                        print("OK trans...", end=" ")
                        item["title"] = translate_to_chinese(item["title"])
                        item["summary"] = translate_to_chinese(item["summary"])
                        item["detail"] = translate_to_chinese(item["detail"])
                        time.sleep(0.5)
                        print("done")
                    else:
                        print("OK")
                    clean_item = {k: v for k, v in item.items() if not k.startswith("_")}
                    clean_item["score"] = score
                    valid_items.append(clean_item)
                    used_urls.add(item["url"])
                    source_count[src] = source_count.get(src, 0) + 1
                else:
                    print("FAILED")

        result[f"category{i}"] = valid_items
        print(f"  Category {i}: {len(valid_items)} items")

    os.makedirs("data", exist_ok=True)
    with open("data/news.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    total = sum(len(result.get(f"category{i}", [])) for i in range(1, 5))
    print(f"\nDone! Total: {total} validated news items")


def deduplicate_titles(items):
    result = []
    for item in items:
        is_dup = False
        for existing in result:
            if is_similar(item["title"], existing["title"]):
                is_dup = True
                break
        if not is_dup:
            result.append(item)
    return result


if __name__ == "__main__":
    main()
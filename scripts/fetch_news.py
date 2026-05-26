import feedparser
import requests
import json
import os
import re
import time
from datetime import datetime, timedelta, timezone
from bs4 import BeautifulSoup

LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "")
LLM_MODEL = os.environ.get("LLM_MODEL", "")

def llm_translate_text(title, summary, detail):
    if not LLM_API_KEY or not LLM_BASE_URL or not LLM_MODEL:
        return None
    try:
        url = LLM_BASE_URL.rstrip("/") + "/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {LLM_API_KEY}",
        }
        prompt = (
            "将以下英文新闻翻译为中文，保持专业术语不变（如LLM、GPU、API等不翻译），输出格式：\n"
            "标题：翻译后的标题\n摘要：翻译后的摘要\n详情：翻译后的详情\n\n"
            f"标题：{title}\n摘要：{summary}\n详情：{detail or summary}"
        )
        payload = {
            "model": LLM_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3,
            "max_tokens": 2000,
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"].strip()
        title_match = re.search(r"标题[：:]\s*(.+)", content)
        summary_match = re.search(r"摘要[：:]\s*(.+)", content)
        detail_match = re.search(r"详情[：:]\s*([\s\S]+?)(?:\n\n|$)", content)
        return {
            "title": title_match.group(1).strip() if title_match else title,
            "summary": summary_match.group(1).strip() if summary_match else summary,
            "detail": detail_match.group(1).strip() if detail_match else (detail or summary),
        }
    except Exception as e:
        print(f"    LLM translation failed: {e}")
        return None

RSS_SOURCES = [
    {"url": "https://techcrunch.com/category/artificial-intelligence/feed/", "source": "TechCrunch", "authority": 0.95},
    {"url": "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", "source": "The Verge", "authority": 0.9},
    {"url": "https://www.technologyreview.com/feed/", "source": "MIT Tech Review", "authority": 0.9},
    {"url": "https://www.wired.com/feed/tag/ai/latest/rss", "source": "Wired", "authority": 0.85},
    {"url": "https://arstechnica.com/tag/ai/feed/", "source": "Ars Technica", "authority": 0.85},
    {"url": "https://venturebeat.com/category/ai/feed/", "source": "VentureBeat", "authority": 0.8},
    {"url": "https://spectrum.ieee.org/rss/fulltext", "source": "IEEE Spectrum", "authority": 0.9},
    {"url": "https://spectrum.ieee.org/semiconductors/rss", "source": "IEEE Spectrum Semi", "authority": 0.85},
    {"url": "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml", "source": "NYT", "authority": 0.9},
    {"url": "https://hnrss.org/newest?q=AI&count=15", "source": "Hacker News", "authority": 0.8},
    {"url": "https://hnrss.org/newest?q=LLM&count=15", "source": "Hacker News", "authority": 0.8},
    {"url": "https://hnrss.org/newest?q=robot&count=15", "source": "Hacker News", "authority": 0.8},
    {"url": "https://hnrss.org/newest?q=nvidia+OR+GPU&count=15", "source": "Hacker News", "authority": 0.8},
    {"url": "https://www.tomshardware.com/feeds/all", "source": "Tom's Hardware", "authority": 0.7},
    {"url": "https://www.newscientist.com/subject/technology/feed/", "source": "New Scientist", "authority": 0.75},
    {"url": "https://feeds.arstechnica.com/arstechnica/technology-lab", "source": "Ars Technica", "authority": 0.8},
    {"url": "https://feeds.feedburner.com/ruanyifeng", "source": "Ruan Yifeng", "authority": 0.75},
    {"url": "https://36kr.com/feed", "source": "36Kr", "authority": 0.85},
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
    "IEEE Spectrum": 0.9,
    "IEEE Spectrum Semi": 0.85,
    "NYT": 0.9,
    "Wired": 0.85,
    "36Kr": 0.85,
    "Ars Technica": 0.85,
    "Hacker News": 0.8,
    "VentureBeat": 0.8,
    "New Scientist": 0.75,
    "ITHome": 0.75,
    "Ruan Yifeng": 0.75,
    "Tom's Hardware": 0.7,
}

BJ_TZ = timezone(timedelta(hours=8))

TERM_WHITELIST = [
    "AGI", "API", "ASIC", "BERT", "B200", "CPU", "CUDA", "DeepSeek",
    "FPGA", "GPT", "GPU", "H100", "H200", "HBM", "IPO", "LLM", "Llama",
    "Mistral", "MIT", "NFT", "NPU", "OpenAI", "RLHF", "SDK", "Sora",
    "TPU", "VLA", "Qwen", "Midjourney", "ElevenLabs", "Notion AI",
    "Waymo", "Copilot", "Stable Diffusion", "RAG",
    "Anthropic", "DeepMind", "VentureBeat", "TechCrunch",
    "ArXiv", "Gemini", "Claude",
]

TRANSLATION_FIXES = {
    "代币": "token",
    "令牌": "token",
    "代币化": "token化",
    "代理人工智能": "智能体 AI",
    "代理式人工智能": "智能体 AI",
    "代理 AI": "智能体 AI",
    "Agentic AI": "智能体 AI",
    "加速器": "加速卡",
    "大型语言模型": "大语言模型",
    "大型语言": "大语言",
    "基础模型": "基础模型",
    "半导体制造": "半导体制造",
    "自主车辆": "自动驾驶车辆",
    "自主驾驶": "自动驾驶",
    "人形": "人形",
    "双足": "双足",
    "体现 AI": "具身智能",
    "体现人工智能": "具身智能",
    "体现智能": "具身智能",
    " embodied AI": " 具身智能",
    " embodied intelligence": " 具身智能",
}


def now_bj():
    return datetime.now(BJ_TZ)


def is_chinese(text):
    if not text:
        return False
    count = 0
    for ch in text:
        if '\u4e00' <= ch <= '\u9fff':
            count += 1
    return count / max(len(text), 1) > 0.1


def _protect_terms(text):
    placeholders = {}
    result = text
    for i, term in enumerate(TERM_WHITELIST):
        placeholder = f"__TERM{i}__"
        if term in result:
            placeholders[placeholder] = term
            result = result.replace(term, placeholder)
    return result, placeholders


def _restore_terms(text, placeholders):
    result = text
    for placeholder, term in placeholders.items():
        result = result.replace(placeholder, term)
    return result


def _post_fix(text):
    for wrong, correct in TRANSLATION_FIXES.items():
        text = text.replace(wrong, correct)
    return text


def translate_to_chinese(text):
    if not text or is_chinese(text):
        return text
    protected, placeholders = _protect_terms(text)
    for attempt in range(3):
        try:
            from deep_translator import GoogleTranslator
            result = GoogleTranslator(source='en', target='zh-CN').translate(protected)
            if result and result != protected:
                result = _restore_terms(result, placeholders)
                result = _post_fix(result)
                return result
        except Exception as e:
            print(f"    Translation retry {attempt+1}: {e}")
            time.sleep(2)
    return _restore_terms(text, placeholders)


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
        pub = datetime.strptime(item["date"], "%Y-%m-%d").replace(tzinfo=BJ_TZ)
        hours_old = (now_bj() - pub).total_seconds() / 3600
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
            pub_date = now_bj().strftime("%Y-%m-%d")
            has_valid_date = False
            if entry.get("published_parsed"):
                try:
                    parsed = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
                    age_hours = (now_bj() - parsed).total_seconds() / 3600
                    if age_hours > 24:
                        continue
                    pub_date = parsed.astimezone(BJ_TZ).strftime("%Y-%m-%d")
                    has_valid_date = True
                except:
                    pass
            if not has_valid_date:
                if entry.get("updated_parsed"):
                    try:
                        parsed = datetime(*entry.updated_parsed[:6], tzinfo=timezone.utc)
                        age_hours = (now_bj() - parsed).total_seconds() / 3600
                        if age_hours > 24:
                            continue
                        pub_date = parsed.astimezone(BJ_TZ).strftime("%Y-%m-%d")
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


MAX_PER_CATEGORY = int(os.environ.get("MAX_NEWS_PER_CATEGORY", "10"))


def main():
    print(f"Fetching RSS feeds... (max {MAX_PER_CATEGORY} per category)")
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

    removed = cross_category_dedup(classified)
    if removed > 0:
        print(f"  Cross-category dedup: removed {removed} duplicates")

    print("\nTranslating...")
    result = {"date": now_bj().strftime("%Y-%m-%d")}
    used_urls = set()

    for i in range(1, 5):
        cat_key = str(i)
        valid_items = []
        source_count = {}
        candidates = classified[cat_key]

        for item in candidates:
            if len(valid_items) >= MAX_PER_CATEGORY:
                break
            src = item.get("source", "")
            if source_count.get(src, 0) >= 3:
                continue
            if item["url"] in used_urls:
                continue

            score = item.get("_score", 0)
            if not is_chinese(item["title"]):
                print(f"  [{score:.2f}] translating: {item['title'][:60]}...")
                llm_result = llm_translate_text(item["title"], item["summary"], item["detail"])
                if llm_result:
                    item["title"] = llm_result["title"]
                    item["summary"] = llm_result["summary"]
                    item["detail"] = llm_result["detail"]
                    print(f"    -> LLM translated")
                else:
                    item["title"] = translate_to_chinese(item["title"])
                    item["summary"] = translate_to_chinese(item["summary"])
                    item["detail"] = translate_to_chinese(item["detail"])
                    time.sleep(0.5)
            else:
                print(f"  [{score:.2f}] OK: {item['title'][:60]}")

            clean_item = {k: v for k, v in item.items() if not k.startswith("_")}
            clean_item["score"] = score
            valid_items.append(clean_item)
            used_urls.add(item["url"])
            source_count[src] = source_count.get(src, 0) + 1

        result[f"category{i}"] = valid_items
        print(f"  Category {i}: {len(valid_items)} items")

    os.makedirs("data", exist_ok=True)
    with open("data/news.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    total = sum(len(result.get(f"category{i}", [])) for i in range(1, 5))
    print(f"\nDone! Total: {total} news items")


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


def cross_category_dedup(classified):
    removed = 0
    all_pairs = []
    for i in range(1, 5):
        for j in range(i + 1, 5):
            all_pairs.append((str(i), str(j)))
    for cat_a, cat_b in all_pairs:
        items_a = classified[cat_a]
        items_b = classified[cat_b]
        remove_from_b = set()
        for idx_b, item_b in enumerate(items_b):
            for idx_a, item_a in enumerate(items_a):
                if idx_a in remove_from_b:
                    continue
                if is_similar(item_a["title"], item_b["title"]):
                    if item_a.get("_score", 0) >= item_b.get("_score", 0):
                        remove_from_b.add(idx_b)
                    else:
                        remove_from_b.add(idx_a)
                    removed += 1
                    break
        classified[cat_a] = [item for idx, item in enumerate(items_a) if idx not in remove_from_b]
        classified[cat_b] = [item for idx, item in enumerate(items_b) if idx not in remove_from_b]
    return removed


if __name__ == "__main__":
    main()
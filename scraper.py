#!/usr/bin/env python3
"""
سكرابر RSS لجلب الأخبار السيبرانية من مصادر عالمية
يُحدّث ملف data/news-data.json مع الحفاظ على البيانات الموجودة
"""
import feedparser
import json
import re
import hashlib
from datetime import datetime, timedelta

FEEDS = [
    {"url": "https://feeds.feedburner.com/TheHackersNews", "source_ar": "The Hacker News", "source_en": "The Hacker News", "priority": 1},
    {"url": "https://www.bleepingcomputer.com/feed/", "source_ar": "BleepingComputer", "source_en": "BleepingComputer", "priority": 1},
    {"url": "https://therecord.media/feed", "source_ar": "The Record", "source_en": "The Record", "priority": 2},
    {"url": "https://krebsonsecurity.com/feed/", "source_ar": "Krebs on Security", "source_en": "Krebs on Security", "priority": 2},
    {"url": "https://www.darkreading.com/rss.xml", "source_ar": "Dark Reading", "source_en": "Dark Reading", "priority": 3},
]

KEYWORDS_AR = ["ثغرة", "اختراق", "فدية", "سيبراني", "تجسس", "أمن", "فيروس", "مالوير", "هجوم", "Zero-Day", "APT"]
KEYWORDS_EN = ["vulnerability", "breach", "ransomware", "cyber", "espionage", "hack", "malware", "zero-day", "APT", "exploit", "CVE"]

DATA_FILE = "news-data.json"
MAX_ARTICLES = 50

def classify_threat(title, summary):
    """تصنيف مستوى التهديد بناءً على الكلمات المفتاحية"""
    text = (title + " " + summary).lower()
    critical_words = ["zero-day", "critical", "zero day", "يوم صفر", "حرج", "nuclear", "scada"]
    high_words = ["ransomware", "breach", "فدية", "اختراق", "apt", "espionage", "تجسس"]
    medium_words = ["vulnerability", "ثغرة", "حماية", "تحديث"]
    
    for w in critical_words:
        if w in text: return "critical"
    for w in high_words:
        if w in text: return "high"
    for w in medium_words:
        if w in text: return "medium"
    return "low"

def classify_category(title, summary):
    """تصنيف القسم"""
    text = (title + " " + summary).lower()
    if any(w in text for w in ["ransomware", "فدية", "breach", "اختراق", "intrusion", "hack"]):
        return "intrusions"
    if any(w in text for w in ["zero-day", "ثغرة", "vulnerability", "cve", "patch"]):
        return "vulns"
    if any(w in text for w in ["espionage", "تجسس", "apt", "state-sponsored", "shadow", "حرب الظل"]):
        return "shadow"
    return "natsec"

def is_relevant(title, summary):
    """فلترة المقالات ذات الصلة بالأمن السيبراني"""
    text = (title + " " + summary).lower()
    for kw in KEYWORDS_AR + KEYWORDS_EN:
        if kw.lower() in text:
            return True
    return False

def generate_id(title):
    """توليد معرف فريد بناءً على عنوان المقال"""
    return abs(int(hashlib.md5(title.encode()).hexdigest()[:8], 16)) % 100000

def clean_html(text):
    """إزالة أكواد HTML من النص"""
    return re.sub(r'<[^>]+>', '', text).strip()

def scrape_feeds():
    """جلب المقالات من جميع المصادر"""
    articles = []
    seen_titles = set()
    
    for feed_info in sorted(FEEDS, key=lambda x: x["priority"]):
        try:
            feed = feedparser.parse(feed_info["url"])
            if feed.bozo and not feed.entries:
                print(f"⚠ فشل جلب: {feed_info['url']}")
                continue
            
            for entry in feed.entries[:15]:
                title = clean_html(entry.get("title", ""))
                summary = clean_html(entry.get("summary", entry.get("description", "")))
                
                if not title or title in seen_titles:
                    continue
                if not is_relevant(title, summary):
                    continue
                
                seen_titles.add(title)
                
                published = entry.get("published_parsed") or entry.get("updated_parsed")
                if published:
                    date_str = datetime(*published[:6]).strftime("%Y-%m-%d")
                else:
                    date_str = datetime.now().strftime("%Y-%m-%d")
                
                # استخراج الصورة
                image = "https://picsum.photos/seed/" + str(generate_id(title)) + "/900/500.jpg"
                if entry.get("media_content"):
                    image = entry["media_content"][0].get("url", image)
                elif entry.get("enclosures"):
                    for enc in entry["enclosures"]:
                        if enc.get("type", "").startswith("image"):
                            image = enc.get("href", image)
                            break
                
                articles.append({
                    "id": generate_id(title),
                    "title_ar": title,
                    "title_en": title,
                    "excerpt_ar": summary[:200] + ("..." if len(summary) > 200 else ""),
                    "excerpt_en": summary[:200] + ("..." if len(summary) > 200 else ""),
                    "content_ar": summary,
                    "content_en": summary,
                    "image": image,
                    "category": classify_category(title, summary),
                    "threat_level": classify_threat(title, summary),
                    "source_ar": feed_info["source_ar"],
                    "source_en": feed_info["source_en"],
                    "date": date_str,
                    "featured": False
                })
        except Exception as e:
            print(f"خطأ في {feed_info['url']}: {e}")
    
    # ترتيب بالأحدث وتحديد المميزة
    articles.sort(key=lambda x: x["date"], reverse=True)
    for i, art in enumerate(articles[:5]):
        art["featured"] = True
    
    return articles[:MAX_ARTICLES]

def main():
    # تحميل البيانات الحالية
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            existing = json.load(f)
        existing_ids = {item["id"] for item in existing}
    except (FileNotFoundError, json.JSONDecodeError):
        existing = []
        existing_ids = set()
    
    # جلب بيانات جديدة
    new_articles = scrape_feeds()
    
    # دمج: إضافة الجديد فقط
    merged = [a for a in new_articles if a["id"] not in existing_ids]
    
    # إبقاء البيانات القديمة التي لم تُستبدل (آخر 30 يوماً)
    cutoff = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    for old in existing:
        if old["id"] not in {a["id"] for a in merged} and old["date"] >= cutoff:
            merged.append(old)
    
    # ترتيب وحد أقصى
    merged.sort(key=lambda x: x["date"], reverse=True)
    merged = merged[:MAX_ARTICLES]
    
    # تحديد المميزة
    for art in merged:
        art["featured"] = False
    for art in merged[:5]:
        art["featured"] = True
    
    # حفظ
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)
    
    print(f"تم تحديث {len(merged)} تقرير استخباراتي ({len(merged) - len(existing)} جديد)")

if __name__ == "__main__":
    main()
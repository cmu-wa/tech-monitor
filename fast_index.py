import os
import json
import httplib2
from oauth2client.service_account import ServiceAccountCredentials

# 1. إعدادات الهوية (سيقرأها السكربت من Secrets التي وضعتها في GitHub)
service_account_info = json.loads(os.environ['SERVICE_ACCOUNT_JSON'])
SCOPES = ['https://www.googleapis.com/auth/indexing']
DOMAIN = "https://tech-monitor-gamma.vercel.app/" # استبدل هذا برابط موقعك الحقيقي

def get_changed_files():
    # هذا الأمر يجلب قائمة بالملفات التي تمت إضافتها في آخر Push داخل مجلد posts
    files = os.popen("git diff --name-only HEAD^ HEAD | grep 'posts/'").read().splitlines()
    return [f"{DOMAIN}/{f}" for f in files if f.endswith('.html')]

def index_urls(urls):
    if not urls:
        print("ℹ️ لا توجد تقارير جديدة لفهرستها.")
        return

    credentials = ServiceAccountCredentials.from_json_keyfile_dict(service_account_info, SCOPES)
    http = credentials.authorize(httplib2.Http())
    endpoint = "https://indexing.googleapis.com/v3/urlNotifications:publish"

    for url in urls:
        print(f"🚀 إرسال أمر فهرسة عاجل لـ: {url}")
        content = {"url": url, "type": "URL_UPDATED"}
        response, content_res = http.request(endpoint, method="POST", body=json.dumps(content))
        
        if response.status == 200:
            print(f"✅ تم قبول الرابط بنجاح!")
        else:
            print(f"❌ فشل: {content_res}")

if __name__ == "__main__":
    new_reports = get_changed_files()
    index_urls(new_reports)
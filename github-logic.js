/**
 * github-logic.js
 * منطق التعامل مع GitHub API — مشترك بين البوابة ولوحة التحكم
 * الهكر الهزبري — الرصد التقني
 */

const GHLogic = (() => {
    /* مفاتيح التخزين */
    const LS_TOKEN = 'tm_gh_token';
    const LS_REPO = 'tm_gh_repo';
    const LS_PATH = 'tm_gh_path';

    /* الحصول على الإعدادات */
    function getConfig() {
        return {
            token: localStorage.getItem(LS_TOKEN) || '',
            repo: localStorage.getItem(LS_REPO) || '',
            path: localStorage.getItem(LS_PATH) || 'data.json'
        };
    }

    function setConfig(token, repo, path) {
        localStorage.setItem(LS_TOKEN, token);
        localStorage.setItem(LS_REPO, repo);
        localStorage.setItem(LS_PATH, path || 'data.json');
    }

    function clearConfig() {
        localStorage.removeItem(LS_TOKEN);
        localStorage.removeItem(LS_REPO);
        localStorage.removeItem(LS_PATH);
    }

    function isConfigured() {
        const c = getConfig();
        return c.token.length > 0 && c.repo.length > 0;
    }

    /* بناء رابط Raw (للقراءة العامة بدون توكن) */
    function buildRawURL(user, repo, path) {
        return `https://raw.githubusercontent.com/${user}/${repo}/main/${path}`;
    }

    /* بناء رابط API (للكتابة يتطلب توكن) */
    function buildAPIURL(repo, path) {
        return `https://api.github.com/repos/${repo}/contents/${path}`;
    }

    /* استخراج اسم المستخدم من اسم المستودع (user/repo) */
    function extractUser(repo) {
        return repo.split('/')[0] || '';
    }

    /* ============================
       القراءة العامة (بدون توكن)
    ============================ */
    async function fetchPublicData(repo, path) {
        const user = extractUser(repo);
        const url = buildRawURL(user, repo, path) + '?t=' + Date.now();
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Public fetch failed: ' + resp.status);
        return await resp.json();
    }

    /* ============================
       القراءة عبر API (يتطلب توكن)
    ============================ */
    async function fetchFileData(repo, path, token) {
        const url = buildAPIURL(repo, path);
        const resp = await fetch(url, {
            headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github.v3+json' }
        });
        if (!resp.ok) {
            if (resp.status === 404) return { sha: null, content: null, exists: false };
            throw new Error('API fetch failed: ' + resp.status);
        }
        const data = await resp.json();
        const decoded = atob(data.content);
        return { sha: data.sha, content: decoded, exists: true };
    }

    /* ============================
       كتابة ملف عبر API
    ============================ */
    async function pushFile(repo, path, token, content, sha, message) {
        const url = buildAPIURL(repo, path);
        const encoded = btoa(unescape(encodeURIComponent(content)));
        const body = {
            message: message || 'Update data.json via Tech Monitor Admin',
            content: encoded,
            branch: 'main'
        };
        /* SHA مطلوب عند تحديث ملف موجود */
        if (sha) body.sha = sha;

        const resp = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.message || 'Push failed: ' + resp.status);
        }
        return await resp.json();
    }

    /* ============================
       العملية الكاملة: نشر البيانات
    ============================ */
    async function publish(data) {
        const config = getConfig();
        if (!config.token || !config.repo) {
            throw new Error('GitHub not configured');
        }

        /* 1. قراءة الملف الحالي للحصول على SHA */
        const current = await fetchFileData(config.repo, config.path, config.token);

        /* 2. تحويل البيانات إلى JSON */
        const jsonStr = JSON.stringify(data, null, 2);

        /* 3. رفع الملف */
        const result = await pushFile(
            config.repo,
            config.path,
            config.token,
            jsonStr,
            current.exists ? current.sha : null,
            'Update ' + config.path + ' — ' + new Date().toISOString().slice(0, 10)
        );

        return result;
    }

    /* تصدير الوظائف العامة */
    return {
        getConfig,
        setConfig,
        clearConfig,
        isConfigured,
        buildRawURL,
        extractUser,
        fetchPublicData,
        fetchFileData,
        pushFile,
        publish
    };
})();
/**
 * github-logic.js — منطق GitHub API + كاش ذكي
 * الهكر الهزبري — الرصد التقني
 */
const GHLogic = (() => {
    const LS_TOKEN = 'tm_gh_token';
    const LS_REPO  = 'tm_gh_repo';
    const LS_PATH  = 'tm_gh_path';
    const LS_CACHE = 'tm_data_cache';
    const LS_CTIME = 'tm_cache_time';
    const CACHE_TTL = 5 * 60 * 1000; /* 5 دقائق فقط */

    function getConfig() {
        return {
            token: localStorage.getItem(LS_TOKEN) || '',
            repo:  localStorage.getItem(LS_REPO)  || '',
            path:  localStorage.getItem(LS_PATH)  || 'data.json'
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
    function extractUser(repo) { return repo.split('/')[0] || ''; }

    /* كاش ذكي: لا يجدد إلا بعد انتهاء الصلاحية */
    function getCachedData() {
        const time = parseInt(localStorage.getItem(LS_CTIME) || '0');
        const now = Date.now();
        if (now - time < CACHE_TTL) {
            const raw = localStorage.getItem(LS_CACHE);
            if (raw) {
                try { return { data: JSON.parse(raw), fresh: false }; }
                catch(e) {}
            }
        }
        return null;
    }
    function setCachedData(data) {
        localStorage.setItem(LS_CACHE, JSON.stringify(data));
        localStorage.setItem(LS_CTIME, Date.now().toString());
    }

    /* قراءة عامة مع كاش — لا طلب unless منتهي الصلاحية */
    async function fetchPublicData(repo, path, forceRefresh) {
        if (!forceRefresh) {
            const cached = getCachedData();
            if (cached) return { data: cached.data, fromCache: true };
        }
        const user = extractUser(repo);
        const url = `https://raw.githubusercontent.com/${user}/${repo}/main/${path}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Raw fetch: ' + resp.status);
        const data = await resp.json();
        setCachedData(data);
        return { data: data, fromCache: false };
    }

    /* قراءة عبر API */
    async function fetchFileData(repo, path, token) {
        const url = `https://api.github.com/repos/${repo}/contents/${path}`;
        const resp = await fetch(url, {
            headers: {
                'Authorization': 'Bearer ' + token,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        if (!resp.ok) {
            if (resp.status === 404) return { sha: null, content: null, exists: false };
            throw new Error('API: ' + resp.status);
        }
        const d = await resp.json();
        return { sha: d.sha, content: atob(d.content), exists: true };
    }

    /* كتابة ملف + تحديث الكاش فوراً */
    async function pushFile(repo, path, token, content, sha, message) {
        const url = `https://api.github.com/repos/${repo}/contents/${path}`;
        const encoded = btoa(unescape(encodeURIComponent(content)));
        const body = { message: message || 'Update via Tech Monitor', content: encoded, branch: 'main' };
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
            throw new Error(err.message || 'Push: ' + resp.status);
        }
        /* نجاح — حدّث الكاش مباشرة بدون انتظار */
        try { setCachedData(JSON.parse(content)); } catch(e) {}
        return await resp.json();
    }

    /* النشر الكامل */
    async function publish(data) {
        const config = getConfig();
        if (!config.token || !config.repo) throw new Error('Not configured');
        const current = await fetchFileData(config.repo, config.path, config.token);
        const jsonStr = JSON.stringify(data, null, 2);
        return await pushFile(
            config.repo, config.path, config.token, jsonStr,
            current.exists ? current.sha : null,
            'Update ' + config.path + ' — ' + new Date().toISOString().slice(0, 10)
        );
    }

    return { getConfig, setConfig, clearConfig, isConfigured, extractUser, fetchPublicData, fetchFileData, pushFile, publish };
})();
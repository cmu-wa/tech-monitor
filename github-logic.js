/**
 * github-logic.js — منطق GitHub API مشترك
 * الهكر الهزبري — الرصد التقني
 */
const GHLogic = (() => {
    const LS_TOKEN = 'tm_gh_token';
    const LS_REPO  = 'tm_gh_repo';
    const LS_PATH  = 'tm_gh_path';

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

    /* قراءة عامة بدون توكن (Raw URL + cache busting) */
    async function fetchPublicData(repo, path) {
        const user = extractUser(repo);
        const url = `https://raw.githubusercontent.com/${user}/${repo}/main/${path}?t=${Date.now()}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Raw fetch failed: ' + resp.status);
        return await resp.json();
    }

    /* قراءة عبر API (يحتاج توكن) */
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
            throw new Error('API fetch failed: ' + resp.status);
        }
        const data = await resp.json();
        return { sha: data.sha, content: atob(data.content), exists: true };
    }

    /* كتابة ملف عبر API */
    async function pushFile(repo, path, token, content, sha, message) {
        const url = `https://api.github.com/repos/${repo}/contents/${path}`;
        const encoded = btoa(unescape(encodeURIComponent(content)));
        const body = {
            message: message || 'Update via Tech Monitor Admin',
            content: encoded,
            branch: 'main'
        };
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

    /* النشر الكامل */
    async function publish(data) {
        const config = getConfig();
        if (!config.token || !config.repo) throw new Error('GitHub not configured');
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
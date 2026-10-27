#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
友链审核机器人（只审核，不写入任何文件）
=========================================
分工：
  机器人 -> 检查访客提交的友链，把结论贴在 Issue 里并 @你
  你     -> 看到「审核通过」后，自己把 YAML 贴进
            content/page/links/index.md 的 links: 数组，跑 上传.bat

所以这个脚本**只做两件写入**：
  1. 在 Issue 下发一条评论（审核结论）
  2. 给 Issue 打标签（友链-通过 / 友链-不通过）

不碰源码仓库、不碰产物页面、不改任何 HTML。
"""

import os
import re
import sys
import json
import ssl
import html as htmllib
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timezone

DRY = os.environ.get("DRY_RUN", "") == "1"
LOCAL_PAGE = os.environ.get("LOCAL_PAGE", "").strip()

BODY = os.environ.get("ISSUE_BODY", "") or ""
INO = os.environ.get("ISSUE_NO", "").strip()
IREPO = os.environ.get("ISSUE_REPO", "").strip()
SUSER = os.environ.get("ISSUE_USER", "").strip()
TOKEN = os.environ.get("GIT_TOKEN", "").strip()

SITE = os.environ.get("SITE_HOST", "yrqspace.github.io").strip().lower()
SITENAME = os.environ.get("SITE_NAME", "爱玩win11的me").strip()
PAGE = os.environ.get("PUB_PAGE", "友情链接/index.html")
OWNER = os.environ.get("OWNER_HANDLE", "YrqSpace").strip().lstrip("@")
MIN_ACCOUNT_DAYS = int(os.environ.get("MIN_ACCOUNT_DAYS", "3"))

API = "https://api.github.com"
UA = "Tabbit-friend-link-reviewer"
UA_BROWSER = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


# ------------------------------------------------------------------ 基础工具
def host_of(url):
    try:
        h = urllib.parse.urlparse(url).netloc.lower()
    except Exception:  # noqa: BLE001
        return ""
    return h[4:] if h.startswith("www.") else h


def normalize_url(raw):
    if not raw:
        return ""
    m = re.search(r"https?://[^\s<>\"'`\)\]，。；]+", raw)
    return m.group(0).rstrip(".,;，。；") if m else ""


def ystr(s):
    return json.dumps(s, ensure_ascii=False)


def esc(s):
    return str(s).replace("`", "'")


def fetch(url):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={
        "User-Agent": UA_BROWSER,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    })
    try:
        with urllib.request.urlopen(req, timeout=25, context=ctx) as r:
            return r.status, r.read(1500000).decode("utf-8", "ignore")
    except urllib.error.HTTPError as e:
        try:
            return e.code, e.read(200000).decode("utf-8", "ignore")
        except Exception:  # noqa: BLE001
            return e.code, ""
    except Exception:  # noqa: BLE001
        return None, ""


def gh(method, path, payload=None):
    if DRY:
        return 200, {}
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Authorization", "Bearer " + TOKEN)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", UA)
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode("utf-8", "ignore")
            return r.status, (json.loads(raw) if raw.strip() else {})
    except urllib.error.HTTPError as e:
        return e.code, {"raw": e.read().decode("utf-8", "ignore")[:300]}
    except Exception as e:  # noqa: BLE001
        return 0, {"raw": repr(e)[:300]}


def comment(text):
    if DRY:
        print("\n======== 将发到 Issue 的评论 ========\n" + text + "\n====================================\n")
        return
    gh("POST", "/repos/%s/issues/%s/comments" % (IREPO, INO), {"body": text})


def add_label(names):
    if DRY:
        print("[DRY] 打标签：", names)
        return
    gh("POST", "/repos/%s/issues/%s/labels" % (IREPO, INO), {"labels": names})


# ------------------------------------------------------------------ 表单解析
def field(name, multi=False):
    pat = r"^#{1,6}[ \t]*" + re.escape(name) + r"[ \t]*\r?\n(.*?)(?=^#{1,6}[ \t]|\Z)"
    m = re.search(pat, BODY, re.S | re.M)
    if not m:
        return ""
    lines = []
    for ln in m.group(1).splitlines():
        ln = ln.strip().strip("`").strip()
        if ln and not ln.startswith("<!--") and not ln.startswith("- ["):
            lines.append(ln)
    if not lines:
        return ""
    if lines[0].lower() in ("_no response_", "no response", "无", "none", "/", "-"):
        return ""
    return " ".join(lines) if multi else lines[0]


# ------------------------------------------------------------------ 现有友链
def existing_hosts(page_html):
    """只取友链列表容器内的链接，避免把顶部社交图标误判成已收录。"""
    start = -1
    for marker in ("article-list--compact links", "article-list links", "article-list"):
        p = page_html.find(marker)
        if p != -1:
            start = p
            break
    if start == -1:
        return set(), []

    end = len(page_html)
    for stop in ('<footer class="site-footer"', 'class="site-footer"'):
        q = page_html.find(stop, start)
        if q != -1:
            end = min(end, q)

    zone = page_html[start:end]
    hosts, pairs = set(), []
    for m in re.finditer(r'<a href="(https?://[^"]+)"', zone):
        link = htmllib.unescape(m.group(1))
        h = host_of(link)
        if not h:
            continue
        hosts.add(h)
        title = ""
        tm = re.search(r'article-title">([^<]*)<', zone[m.end():m.end() + 800])
        if tm:
            title = htmllib.unescape(tm.group(1)).strip()
        pairs.append((title, link))
    return hosts, pairs


# ------------------------------------------------------------------ 结论输出
def verdict_pass(*, name, desc, url, avatar, note=""):
    yaml_block = "\n".join([
        "  - title: " + ystr(name),
        "    description: " + ystr(desc),
        "    website: " + url,
    ] + (["    image: " + avatar] if avatar else []))

    lines = [
        "## ✅ 审核通过",
        "",
        "@" + OWNER + " 这条可以加，你上线时复制下面的内容就行。",
        "",
        "| 检查项 | 结果 |",
        "| --- | --- |",
        "| 必填信息 | 完整 |",
        "| 站点可访问 | 正常 |",
        "| 已加本站友链 | 检测到 |",
        "| 域名重复 | 未收录过 |",
        "| 账号 | 正常 |",
    ]
    if note:
        lines.append("| 备注 | " + note + " |")
    lines += [
        "",
        "### 你手动添加的步骤",
        "",
        "1. 打开 `content/page/links/index.md`",
        "2. 在 `links:` 下面粘贴这段：",
        "",
        "```yaml",
        yaml_block,
        "```",
        "",
        "3. 跑 `上传.bat`，构建完成后生效",
        "",
        "---",
        "添加完把这条 Issue 关掉即可。",
    ]
    comment("\n".join(lines))
    add_label(["友链-通过"])


def verdict_fail(reason, tips, draft_yaml):
    lines = [
        "## ❌ 审核没通过",
        "",
        "**原因**：" + esc(reason),
        "",
    ]
    if tips:
        lines += ["**怎么改**：", ""] + ["- " + esc(t) for t in tips] + [""]
    if draft_yaml:
        lines += [
            "**按现在的信息整理出的条目**（等他改好后你就不用再拼了）：",
            "",
            "```yaml",
            draft_yaml,
            "```",
            "",
        ]
    lines += [
        "---",
        "已经标记 `友链-不通过`，不需要你处理。",
        "对方改完会编辑本 Issue，机器人会自动重新审核一遍。",
    ]
    comment("\n".join(lines))
    add_label(["友链-不通过"])
    # 必须终止，否则会继续往下跑到 verdict_pass，在同一个 Issue 里
    # 同时留下「不通过」和「通过」两条矛盾结论。
    sys.exit(0)


BASE_TIPS = [
    "本站信息：名称「%s」/ 地址 https://%s" % (SITENAME, SITE),
    "改好后**编辑本 Issue 正文**保存，机器人会自动重新审核",
]


# ------------------------------------------------------------------ 主流程
def main():
    global BODY, SUSER

    if not BODY.strip() and INO and not DRY:
        st, d = gh("GET", "/repos/%s/issues/%s" % (IREPO, INO))
        if st == 200:
            BODY = d.get("body", "") or ""
            SUSER = SUSER or ((d.get("user") or {}).get("login", "") or "")

    if not BODY.strip():
        verdict_fail("Issue 内容为空，没读到申请信息。",
                     ["请用「申请友链」模板重新提交"], "")

    name = field("站点名称") or field("站点名")
    desc = field("站点简介", multi=True)
    url = normalize_url(field("站点地址") or field("网站地址") or field("站点链接"))
    avatar = normalize_url(field("头像地址") or field("头像"))
    friend_page = normalize_url(field("你的友链页地址"))

    draft = ["  - title: " + ystr(name or "（待填写）"),
             "    description: " + ystr(desc or "（待填写）"),
             "    website: " + (url or "https://（待填写）")]
    if avatar:
        draft.append("    image: " + avatar)
    draft_yaml = "\n".join(draft)

    # ---- 必填与长度 ----
    if not name:
        verdict_fail("没填「站点名称」。", BASE_TIPS, draft_yaml)
    if len(name) > 40:
        verdict_fail("「站点名称」太长（%d 字），请压到 40 字内。" % len(name), BASE_TIPS, draft_yaml)
    if not desc:
        verdict_fail("没填「站点简介」。", BASE_TIPS, draft_yaml)
    if len(desc) > 100:
        verdict_fail("「站点简介」太长（%d 字），请压到 100 字内。" % len(desc), BASE_TIPS, draft_yaml)
    if not url:
        verdict_fail("「站点地址」没填或不是合法网址。",
                     ["示例：https://example.com"] + BASE_TIPS, draft_yaml)
    if not url.startswith("https://"):
        verdict_fail("站点地址必须是 https（交换须知第一条：全站 HTTPS）。", BASE_TIPS, draft_yaml)
    host = host_of(url)
    if not host or "." not in host:
        verdict_fail("地址里解析不出域名：" + url, BASE_TIPS, draft_yaml)
    if host == SITE or host.endswith("." + SITE):
        verdict_fail("地址填成了本站。", BASE_TIPS, draft_yaml)

    # ---- 账号年龄 ----
    if MIN_ACCOUNT_DAYS > 0 and SUSER and not DRY:
        st, u = gh("GET", "/users/" + SUSER)
        if st == 200 and u.get("created_at"):
            try:
                born = datetime.strptime(u["created_at"], "%Y-%m-%dT%H:%M:%SZ").replace(
                    tzinfo=timezone.utc)
                days = (datetime.now(timezone.utc) - born).total_seconds() / 86400.0
                if days < MIN_ACCOUNT_DAYS:
                    verdict_fail(
                        "提交账号 @%s 注册才 %.1f 天，低于 %d 天门槛，疑似新号批量申请。"
                        % (SUSER, days, MIN_ACCOUNT_DAYS),
                        ["换常用账号提交，或直接联系站长说明"], draft_yaml)
            except ValueError:
                pass

    # ---- 查重（读现有友链页） ----
    page_html = ""
    if LOCAL_PAGE and os.path.isfile(LOCAL_PAGE):
        with open(LOCAL_PAGE, encoding="utf-8", errors="ignore") as f:
            page_html = f.read()
    elif os.path.isfile(PAGE):
        with open(PAGE, encoding="utf-8", errors="ignore") as f:
            page_html = f.read()

    if page_html:
        hosts, pairs = existing_hosts(page_html)
        if host in hosts:
            same = [l for t, l in pairs if host_of(l) == host]
            verdict_fail(
                "域名 `%s` 已经在友链里了。" % host,
                ["如果是想改名称/简介，需要在 Issue 里说明，站长手动改那条",
                 "这次不重复添加"],
                yaml_block_for(name, desc, url, avatar))

    # ---- 站点可访问 ----
    status, html = fetch(url)
    if status is None:
        verdict_fail("站点连不上（超时或域名解析失败）：" + url, [
            "确认域名能正常打开",
            "确认没开防盗链 / 强制登录 / 反爬拦截",
        ] + BASE_TIPS, draft_yaml)
    if status >= 400 and status != 403:
        verdict_fail("站点返回 HTTP %s，现在打不开。" % status,
                     ["确认首页能直接访问，不需要登录"] + BASE_TIPS, draft_yaml)

    # ---- 反向链接 ----
    note = ""
    if SITE not in (html or "").lower():
        checked = False
        if friend_page and friend_page != url:
            st2, html2 = fetch(friend_page)
            if st2 and st2 < 400 and SITE in (html2 or "").lower():
                checked = True
                note = "本站链接在你填的友链页 %s 里找到" % friend_page
        if not checked:
            verdict_fail(
                "在你站点里没找到本站友链（未检测到 `%s`）。" % SITE,
                ["交换须知要求「先加本站友链，再提交申请」",
                 "把本站加到你的友链页后重试",
                 "如果友链在单独一页，请在表单「你的友链页地址」里填上该页完整地址，"
                 "机器人会去那一页找",
                 "如果友链页是 JS 异步渲染、抓不到静态 HTML，请在 Issue 里说明，站长人工看"],
                draft_yaml)

    # ---- 通过 ----
    verdict_pass(name=name, desc=desc, url=url, avatar=avatar, note=note)


def yaml_block_for(name, desc, url, avatar):
    return "\n".join([
        "  - title: " + ystr(name),
        "    description: " + ystr(desc),
        "    website: " + url,
    ] + (["    image: " + avatar] if avatar else []))


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001
        print("UNEXPECTED:", repr(exc), file=sys.stderr)
        try:
            comment("## ⚠️ 审核脚本出错了\n\n```\n" + esc(repr(exc))[:1000] +
                    "\n```\n\n@%s 这条需要你人工看一眼。" % OWNER)
            add_label(["友链-待人工"])
        except Exception:  # noqa: BLE001
            pass
        sys.exit(0)

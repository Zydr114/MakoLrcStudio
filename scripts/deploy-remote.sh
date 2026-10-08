#!/usr/bin/env bash
# 把当前生产构建发布到 ssh tencent 的 Caddy 静态站点。
# 目标入口：https://tool.talium.site/MakoLrcStudio/
#
# 步骤：本地构建 → rsync 同步 dist → 合并站点块到远端 Caddyfile → 校验并 reload → HTTPS 探活。
# 可覆盖：DEPLOY_HOST / SITE_DOMAIN / APP_PATH / REMOTE_ROOT / CADDYFILE / DEPLOY_SKIP_BUILD=1
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SNIPPET="${ROOT_DIR}/scripts/tool.talium.site.caddyfile"

HOST="${DEPLOY_HOST:-tencent}"
SITE_DOMAIN="${SITE_DOMAIN:-tool.talium.site}"
APP_PATH="${APP_PATH:-/MakoLrcStudio}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/${SITE_DOMAIN}}"
REMOTE_APP_DIR="${REMOTE_ROOT}${APP_PATH}"
CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
SKIP_BUILD="${DEPLOY_SKIP_BUILD:-0}"

SSH_OPTS=(-o ConnectTimeout=10)
step() { printf '\n== %s ==\n' "$*"; }
fail() {
	printf '部署失败：%s\n' "$*" >&2
	exit 1
}
ssh_run() { ssh "${SSH_OPTS[@]}" "$HOST" "$@"; }

step "1/5 预检"
[[ -f "$SNIPPET" ]] || fail "缺少站点块文件 ${SNIPPET}"
ssh_run 'true' >/dev/null 2>&1 || fail "ssh ${HOST} 不可达"
ssh_run 'command -v rsync >/dev/null && command -v caddy >/dev/null && sudo -n true' ||
	fail "远端缺少 rsync／caddy，或 sudo 需要密码"
REMOTE_USER="$(ssh_run 'id -un')"
printf '远端主机 %s，站点目录 %s，执行用户 %s\n' "${HOST}" "${REMOTE_APP_DIR}" "${REMOTE_USER}"

step "2/5 本地构建"
if [[ "${SKIP_BUILD}" == "1" ]]; then
	printf '跳过构建（DEPLOY_SKIP_BUILD=1）\n'
else
	(cd "$ROOT_DIR" && npm run build)
fi
[[ -f "${ROOT_DIR}/dist/index.html" ]] || fail "dist/index.html 不存在"
printf 'dist/index.html sha256 %s\n' "$(sha256sum "${ROOT_DIR}/dist/index.html" | cut -d' ' -f1)"

step "3/5 同步静态文件到 ${REMOTE_APP_DIR}"
ssh_run "sudo -n install -d -o '${REMOTE_USER}' -g '${REMOTE_USER}' '${REMOTE_APP_DIR}'"
rsync -az --delete --chmod=D755,F644 \
	-e "ssh ${SSH_OPTS[*]}" \
	"${ROOT_DIR}/dist/" "${HOST}:${REMOTE_APP_DIR}/"

step "4/5 更新 Caddy 站点块"
scp "${SSH_OPTS[@]}" "$SNIPPET" "${HOST}:/tmp/mako-lrc-studio.caddyfile"
ssh_run 'cat > /tmp/mako-lrc-studio-merge.py' <<'PY'
import pathlib
import re
import sys

BEGIN = "# >>> MakoLrcStudio deploy block"
END = "# <<< MakoLrcStudio deploy block <<<"
# 旧项目名留下的标记块。改名后必须先删掉，否则 Caddyfile 会出现两个
# tool.talium.site 站点块，caddy validate 以站点定义重复失败。
LEGACY = [
    ("# >>> MakoLrcEditor deploy block", "# <<< MakoLrcEditor deploy block <<<"),
]


def remove_blocks(text, markers):
    """删除标记块（含标记行本身）并合并多余空行。"""
    kept, skipping = [], False
    for line in text.splitlines(keepends=True):
        stripped = line.strip()
        if any(stripped == begin for begin, _ in markers):
            skipping = True
        elif skipping and any(stripped == end for _, end in markers):
            skipping = False
        elif not skipping:
            kept.append(line)
    return re.sub(r"\n{3,}", "\n\n", "".join(kept))


snippet_path, caddyfile_path = sys.argv[1], sys.argv[2]
snippet = pathlib.Path(snippet_path).read_text(encoding="utf-8")
if BEGIN not in snippet or END not in snippet:
    sys.exit("站点块缺少标记注释行")
block = snippet.split(BEGIN, 1)[1].split(END, 1)[0].strip("\n")

caddyfile = pathlib.Path(caddyfile_path)
original = caddyfile.read_text(encoding="utf-8")
current = remove_blocks(original, LEGACY)
if original != current:
    print("已移除旧项目名的站点块")
if BEGIN in current and END in current:
    head, rest = current.split(BEGIN, 1)
    _, tail = rest.split(END, 1)
    updated = head + BEGIN + "\n" + block + "\n" + END + tail
else:
    updated = current.rstrip("\n") + "\n\n" + BEGIN + "\n" + block + "\n" + END + "\n"

if updated == original:
    print("Caddyfile 未变化")
else:
    backup = caddyfile.with_name(caddyfile.name + ".mako-bak")
    backup.write_text(original, encoding="utf-8")
    caddyfile.write_text(updated, encoding="utf-8")
    print(f"Caddyfile 已更新，改动前备份 {backup}")
PY
ssh_run "sudo -n python3 /tmp/mako-lrc-studio-merge.py /tmp/mako-lrc-studio.caddyfile '${CADDYFILE}'"
ssh_run "sudo -n caddy validate --config '${CADDYFILE}' --adapter caddyfile"
ssh_run "sudo -n systemctl reload caddy"

step "5/5 HTTPS 探活"
BASE="https://${SITE_DOMAIN}${APP_PATH}"
ROOT_URL="https://${SITE_DOMAIN}/"

check_code() {
	local desc="$1" expected="$2" url="$3" code
	code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$url")"
	printf '%-28s %s  %s\n' "$desc" "$code" "$url"
	[[ "$code" == "$expected" ]] || fail "${desc} 期望 ${expected}，实际 ${code}（${url}）"
}

check_code "入口不带尾斜杠" 308 "$BASE"
check_code "应用首页" 200 "${BASE}/"
check_code "站点根" 404 "$ROOT_URL"

entry="$(curl -sS --max-time 20 "${BASE}/")"
js="$(printf '%s' "$entry" | grep -oE 'assets/[^"]+\.js' | head -1 || true)"
css="$(printf '%s' "$entry" | grep -oE 'assets/[^"]+\.css' | head -1 || true)"
[[ -n "$js" ]] || fail "首页未引用哈希 JS 资源"
[[ -n "$css" ]] || fail "首页未引用哈希 CSS 资源"

header_value() { # url header-name
	curl -sSI --max-time 20 "$1" | tr -d '\r' | awk -v name="$2" 'BEGIN{IGNORECASE=1} index(tolower($0), tolower(name)":")==1 {sub(/^[^:]*:[ ]*/, ""); print; exit}'
}

entry_cc="$(header_value "${BASE}/" Cache-Control)"
printf '%-28s %s\n' "首页 Cache-Control" "${entry_cc}"
[[ "${entry_cc}" == *no-cache* ]] || fail "首页未发送 no-cache（实际 ${entry_cc:-无}）"

for asset in "$js" "$css"; do
	check_code "哈希资源" 200 "${BASE}/${asset}"
	cc="$(header_value "${BASE}/${asset}" Cache-Control)"
	printf '%-28s %s\n' "  ${asset} Cache-Control" "${cc}"
	[[ "${cc}" == *immutable* ]] || fail "${asset} 未发送 immutable 缓存头（实际 ${cc:-无}）"
done

printf '\n证书信息：\n'
echo | openssl s_client -connect "${SITE_DOMAIN}:443" -servername "${SITE_DOMAIN}" 2>/dev/null |
	openssl x509 -noout -subject -dates || printf '（openssl 查询跳过）\n'

printf '\n部署完成：https://%s%s/\n' "${SITE_DOMAIN}" "${APP_PATH}"

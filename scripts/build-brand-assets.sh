#!/usr/bin/env bash
# 从品牌源图生成站点与文档实际使用的品牌资源。
#
# 源图（不纳入仓库，体积大且不直接发布）：
#   MakoLrcStudio-Main.png  宽字标，2:1，用于首页标题区与 README 顶部
#   MakoLrcStudio-Logo.png  方徽标，用于页头品牌标与浏览器标签页图标
#
# 用法：scripts/build-brand-assets.sh <源图所在目录>
# 依赖：ImageMagick（magick 或 convert）
#
# 产物（全部 PNG 无损；源图先裁掉透明边，保证不同尺寸下留白一致）：
#   src/assets/brand/mark.png           页头品牌标，宽 120（对应 CSS 40px @3x）
#   src/assets/brand/wordmark.png       首页字标，宽 456（对应 CSS 152px @3x）
#   src/assets/brand/wordmark-full.png  README 用原始分辨率，不缩放
#   public/favicon-32.png               标签页图标 32×32，透明
#   public/favicon-48.png               标签页图标 48×48，透明
#   public/apple-touch-icon.png         180×180 白底（iOS 会按圆角裁切且不与页面混合）
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="${1:-}"
PNG_OPTS=(-strip -define png:compression-level=9)

if [[ -z "${SRC_DIR}" ]]; then
	printf '用法：%s <含 MakoLrcStudio-Main.png / -Logo.png 的目录>\n' "$0" >&2
	exit 2
fi

MAIN="${SRC_DIR}/MakoLrcStudio-Main.png"
LOGO="${SRC_DIR}/MakoLrcStudio-Logo.png"
for file in "${MAIN}" "${LOGO}"; do
	[[ -f "${file}" ]] || {
		printf '缺少源图：%s\n' "${file}" >&2
		exit 1
	}
done

if command -v magick >/dev/null; then
	MAGICK=(magick)
elif command -v convert >/dev/null; then
	MAGICK=(convert)
else
	printf '需要 ImageMagick（magick 或 convert）\n' >&2
	exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
"${MAGICK[@]}" "${MAIN}" -trim +repage "${WORK}/main.png"
"${MAGICK[@]}" "${LOGO}" -trim +repage "${WORK}/logo.png"

install -d "${ROOT_DIR}/src/assets/brand" "${ROOT_DIR}/public"

# 页内图片按 CSS 尺寸的 3 倍导出，兼顾高 DPI 屏幕。
"${MAGICK[@]}" "${WORK}/logo.png" -resize 120x "${PNG_OPTS[@]}" \
	"${ROOT_DIR}/src/assets/brand/mark.png"
"${MAGICK[@]}" "${WORK}/main.png" -resize 456x "${PNG_OPTS[@]}" \
	"${ROOT_DIR}/src/assets/brand/wordmark.png"
# README 在 GitHub 上按 width 属性缩放，需要原始分辨率才够清晰。
"${MAGICK[@]}" "${WORK}/main.png" "${PNG_OPTS[@]}" \
	"${ROOT_DIR}/src/assets/brand/wordmark-full.png"

# 标签页图标：等比缩到画布内再补成正方形，避免贴边或变形。
for size in 32 48; do
	"${MAGICK[@]}" "${WORK}/logo.png" -resize "$((size - 2))x$((size - 2))" -background none \
		-gravity center -extent "$((size - 2))x$((size - 2))" -background none \
		-gravity center -extent "${size}x${size}" \
		"${ROOT_DIR}/public/favicon-${size}.png"
done

# 白底与徽标自带的白色贴纸面一致，可完整保留徽标的藏青外描边。
"${MAGICK[@]}" "${WORK}/logo.png" -resize 160x -background none -gravity center -extent 160x160 "${WORK}/touch.png"
"${MAGICK[@]}" -size 180x180 xc:white "${WORK}/touch.png" -gravity center -composite -strip \
	"${ROOT_DIR}/public/apple-touch-icon.png"

printf '品牌资源已生成：\n'
for file in src/assets/brand/mark.png src/assets/brand/wordmark.png \
	src/assets/brand/wordmark-full.png public/favicon-32.png public/favicon-48.png \
	public/apple-touch-icon.png; do
	printf '  %-38s %s\n' "${file}" \
		"$("${MAGICK[@]}" identify -format '%wx%h %b' "${ROOT_DIR}/${file}")"
done

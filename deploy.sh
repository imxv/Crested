#!/usr/bin/env bash
# 睫角守宫饲养台 · 一键部署到 Cloudflare Pages + D1
# 在本目录运行：bash deploy.sh
set -euo pipefail
cd "$(dirname "$0")"
W="npx --yes wrangler@4"

d1_id() {
  $W d1 list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s).find(d=>d.name==="crested-gecko-db");process.stdout.write(x?x.uuid:"")})'
}

echo "== 1/5 检查登录（第一次会打开浏览器让你登录 Cloudflare）"
$W whoami >/dev/null 2>&1 || $W login

echo "== 2/5 创建 D1 数据库（已存在则跳过）"
if grep -q REPLACE_WITH_D1_ID wrangler.toml; then
  ID=$(d1_id)
  if [ -z "$ID" ]; then
    $W d1 create crested-gecko-db </dev/null >/dev/null
    ID=$(d1_id)
  fi
  sed -i.bak "s/REPLACE_WITH_D1_ID/$ID/" wrangler.toml && rm -f wrangler.toml.bak
fi

echo "== 3/5 建表并导入现有数据（只导入一次）"
$W d1 execute crested-gecko-db --remote --file schema.sql -y
if [ ! -f .seeded ] && [ -f seed.sql ]; then
  $W d1 execute crested-gecko-db --remote --file seed.sql -y && touch .seeded
fi

echo "== 4/5 创建 Pages 项目（已存在则跳过）"
$W pages project create crested-gecko --production-branch main >/dev/null 2>&1 || true

echo "== 5/5 上传网页"
$W pages deploy --project-name crested-gecko --branch main --commit-dirty=true

echo
echo "完成。如需访问密码，在 Cloudflare 后台给 crested-gecko 加机密变量 APP_PASSWORD，再运行一次 bash deploy.sh。"

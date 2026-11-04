# 睫角守宫饲养台

管理睫角守宫（crested gecko）的个人工作台：个体档案（性别、品系、断尾、有町无町）、喂食 / 喷水 / 称重记录、按体重分档的喂食方案、繁殖与孵化、谱系图、体重统计、待办。

线上地址：https://crested-gecko-npr.pages.dev

## 结构

- `public/index.html`：整个前端，一个文件。在 Claude 的 Artifact 里打开时用 Artifact 自带的数据库；在别处打开时通过 `/api` 读写 Cloudflare D1。
- `functions/api/[[path]].js`：Cloudflare Pages Functions 后端。
  - `GET /api/data`：全部数据
  - `PUT /api/doc/<集合>/<id>`、`DELETE /api/doc/<集合>/<id>`：写入 / 删除一条
  - `POST /api/import`：批量导入
- `schema.sql`：D1 建表（一张 `docs` 表：col, id, data, updated_at）。
- `deploy.sh`：一键部署（登录、建 D1、建表、可选导入 `seed.sql`、上传 Pages）。

## 部署

需要 Node.js 18+。运行 `bash deploy.sh`，第一次会打开浏览器登录 Cloudflare。

`seed.sql` / `seed.json` 是个人数据，已在 `.gitignore` 里排除；放在目录下时，部署脚本会导入一次。

## 访问密码（可选）

默认不需要密码。在 Cloudflare 后台给 Pages 项目加机密变量 `APP_PASSWORD` 并重新部署后，打开网页需要输入这个密码。

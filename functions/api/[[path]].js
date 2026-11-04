// 睫角守宫饲养台 · Cloudflare Pages Functions 后端
// 数据存在 D1 的 docs 表：每条记录 = (col, id, data JSON)。
// 如果设置了 APP_PASSWORD，所有 /api/* 请求都要带 Authorization: Bearer <APP_PASSWORD>。

const COLS = new Set(['geckos', 'logs', 'pairings', 'clutches', 'todos']);
const ID_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

function sameString(a, b) {
  // 长度不同直接 false；长度相同时逐字节比较，避免提前退出
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authed(request, env) {
  const h = request.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  return sameString(token, env.APP_PASSWORD);
}

export async function onRequest({ request, env, params }) {
  if (!env.DB) return json({ error: 'no_db', message: '没有绑定 D1 数据库（binding 名应为 DB）' }, 500);
  // 没设 APP_PASSWORD 时不需要密码；设了以后每个请求都要带密码
  if (env.APP_PASSWORD && !authed(request, env)) return json({ error: 'unauthorized', message: '密码不对' }, 401);

  const parts = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  const method = request.method;

  try {
    // GET /api/data → 全部数据
    if (parts[0] === 'data' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT col, id, data FROM docs').all();
      const out = {};
      for (const c of COLS) out[c] = [];
      for (const r of results) if (out[r.col]) out[r.col].push({ id: r.id, ...JSON.parse(r.data) });
      return json(out);
    }

    // PUT/DELETE /api/doc/<col>/<id>
    if (parts[0] === 'doc' && parts.length === 3) {
      const [, col, id] = parts;
      if (!COLS.has(col) || !ID_RE.test(id)) return json({ error: 'bad_path' }, 400);
      if (method === 'PUT') {
        const body = await request.json();
        if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'bad_body' }, 400);
        delete body.id;
        const data = JSON.stringify(body);
        if (data.length > 256 * 1024) return json({ error: 'too_large' }, 413);
        await env.DB.prepare(
          'INSERT INTO docs (col, id, data, updated_at) VALUES (?1, ?2, ?3, ?4) ' +
          'ON CONFLICT(col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
        ).bind(col, id, data, Date.now()).run();
        return json({ ok: true, id });
      }
      if (method === 'DELETE') {
        await env.DB.prepare('DELETE FROM docs WHERE col = ?1 AND id = ?2').bind(col, id).run();
        return json({ ok: true });
      }
    }

    // POST /api/import  body: {geckos:[...], logs:[...], ...}
    if (parts[0] === 'import' && method === 'POST') {
      const body = await request.json();
      const stmts = [];
      for (const col of COLS) {
        for (const doc of Array.isArray(body?.[col]) ? body[col] : []) {
          if (!doc || typeof doc !== 'object' || !ID_RE.test(String(doc.id || ''))) continue;
          const { id, ...rest } = doc;
          stmts.push(env.DB.prepare(
            'INSERT INTO docs (col, id, data, updated_at) VALUES (?1, ?2, ?3, ?4) ' +
            'ON CONFLICT(col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
          ).bind(col, String(id), JSON.stringify(rest), Date.now()));
        }
      }
      for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
      return json({ ok: true, count: stmts.length });
    }

    if (parts[0] === 'ping') return json({ ok: true });
    return json({ error: 'not_found' }, 404);
  } catch (e) {
    return json({ error: 'server_error', message: String(e && e.message || e) }, 500);
  }
}

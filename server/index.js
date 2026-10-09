import { URL } from "node:url";
import { connect, isReady, users, polls, votes, toId, mapPoll } from "./db.js";
import { createApp, readJson, sendEmpty, sendJson, serveStatic } from "./http.js";
import { getUserFromRequest, hashPassword, signToken, verifyPassword } from "./middleware/auth.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
function usernameQuery(username) { return new RegExp("^" + username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"); }
function requireUser(req, res) { const user = getUserFromRequest(req); if (!user) { sendJson(res, 401, { error: "No autenticado" }); return null; } return user; }
async function withCounts(rows, userId) {
  const ids = rows.map((row) => String(row._id));
  const cast = await votes().find({ pollId: { $in: ids } }).toArray();
  return rows.map((row) => {
    const mine = cast.find((vote) => vote.pollId === String(row._id) && vote.userId === userId);
    const counts = row.options.map((_, index) => cast.filter((vote) => vote.pollId === String(row._id) && vote.option === index).length);
    const mapped = mapPoll(row, counts, mine ? mine.option : "");
    mapped.mineOwn = row.userId === userId;
    return mapped;
  });
}

const server = createApp(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname } = url;
  const method = req.method || "GET";
  if (pathname === "/health") return sendJson(res, 200, { ok: true, db: isReady() });
  if (pathname.startsWith("/api/") && !isReady()) return sendJson(res, 503, { error: "Base no lista" });
  if (!pathname.startsWith("/api/")) return serveStatic(req, res);

  if (method === "POST" && pathname === "/api/auth/register") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!USERNAME_RE.test(username)) return sendJson(res, 400, { error: "Usuario: 3-20 caracteres, letras, numeros y _" });
    if (password.length < 6) return sendJson(res, 400, { error: "La contrasena debe tener al menos 6 caracteres" });
    if (await users().findOne({ username: usernameQuery(username) })) return sendJson(res, 409, { error: "Ese usuario ya existe" });
    const result = await users().insertOne({ username, passwordHash: hashPassword(password), createdAt: new Date() });
    const user = { id: String(result.insertedId), username };
    return sendJson(res, 201, { user, token: signToken(user) });
  }
  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const row = await users().findOne({ username: usernameQuery(username) });
    if (!row || !verifyPassword(String(body.password || ""), row.passwordHash)) return sendJson(res, 401, { error: "Usuario o contrasena incorrectos" });
    const user = { id: String(row._id), username: row.username };
    return sendJson(res, 200, { user, token: signToken(user) });
  }
  if (method === "GET" && pathname === "/api/auth/me") {
    const user = requireUser(req, res);
    if (!user) return;
    const row = await users().findOne({ _id: toId(user.id) });
    if (!row) return sendJson(res, 401, { error: "Usuario no encontrado" });
    return sendJson(res, 200, { user: { id: String(row._id), username: row.username } });
  }

  const user = requireUser(req, res);
  if (!user) return;
  const userId = user.id;

  if (method === "GET" && pathname === "/api/polls") {
    const rows = await polls().find({}).sort({ createdAt: -1 }).limit(50).toArray();
    return sendJson(res, 200, { polls: await withCounts(rows, userId) });
  }
  if (method === "POST" && pathname === "/api/polls") {
    const body = await readJson(req);
    const question = String(body.question || "").trim();
    const options = [...new Set((body.options || []).map((item) => String(item).trim()).filter(Boolean))].slice(0, 4);
    if (!question || options.length < 2) return sendJson(res, 400, { error: "Pregunta y al menos 2 opciones" });
    const result = await polls().insertOne({ userId, question: question.slice(0, 140), options: options.map((item) => item.slice(0, 40)), createdAt: new Date() });
    return sendJson(res, 201, { poll: (await withCounts([await polls().findOne({ _id: result.insertedId })], userId))[0] });
  }
  const voteMatch = pathname.match(/^\/api\/polls\/([a-fA-F0-9]{24})\/vote$/);
  if (voteMatch && method === "POST") {
    const poll = await polls().findOne({ _id: toId(voteMatch[1]) });
    if (!poll) return sendJson(res, 404, { error: "Encuesta no encontrada" });
    const body = await readJson(req);
    const option = Number(body.option);
    if (!Number.isInteger(option) || option < 0 || option >= poll.options.length) return sendJson(res, 400, { error: "Opcion invalida" });
    try {
      await votes().insertOne({ pollId: String(poll._id), userId, option, createdAt: new Date() });
    } catch { return sendJson(res, 409, { error: "Ya votaste" }); }
    return sendJson(res, 201, { poll: (await withCounts([poll], userId))[0] });
  }
  const match = pathname.match(/^\/api\/polls\/([a-fA-F0-9]{24})$/);
  if (match && method === "DELETE") {
    const result = await polls().deleteOne({ _id: toId(match[1]), userId });
    if (!result.deletedCount) return sendJson(res, 404, { error: "Encuesta no encontrada" });
    await votes().deleteMany({ pollId: match[1] });
    return sendEmpty(res, 204);
  }
  sendJson(res, 404, { error: "Ruta no encontrada" });
});

server.listen(PORT, HOST, () => console.log(`Encuestas en http://${HOST}:${PORT}`));
async function bootDb() { for (;;) { try { await connect(); return; } catch (err) { console.error("Mongo no disponible:", err.message); await new Promise((resolve) => setTimeout(resolve, 5000)); } } }
bootDb();

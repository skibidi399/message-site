import { Buffer } from "buffer";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Use POST" };

  const GH_OWNER = process.env.GITHUB_OWNER;
  const GH_REPO  = process.env.GITHUB_REPO;
  const FILE_PATH = process.env.FILE_PATH || "public/messages.json";
  const TOKEN = process.env.GITHUB_TOKEN;

  if (!GH_OWNER || !GH_REPO || !TOKEN) {
    return { statusCode: 500, body: "Server misconfigured: missing env vars" };
  }

  let body;
  try { body = JSON.parse(event.body); } catch (e) {
    return { statusCode: 400, body: "Invalid JSON" };
  }
  const { username, message } = body;
  if (!username || !message) return { statusCode: 400, body: "username and message required" };

  const apiBase = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${FILE_PATH}`;

  // GET current file to obtain sha
  const getRes = await fetch(apiBase, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github.v3+json" }
  });

  if (!getRes.ok) {
    const t = await getRes.text();
    return { statusCode: 500, body: `GitHub GET failed: ${getRes.status} ${t}` };
  }

  const getJson = await getRes.json();
  const sha = getJson.sha;
  const contentBase64 = (getJson.content || "").replace(/\n/g, "");
  const current = JSON.parse(Buffer.from(contentBase64, "base64").toString("utf8") || "[]");

  // Append new message
  const newEntry = { username: String(username), message: String(message), timestamp: new Date().toISOString() };
  current.push(newEntry);

  // PUT updated file
  const newContent = Buffer.from(JSON.stringify(current, null, 2)).toString("base64");
  const putBody = {
    message: `Add message from ${username}`,
    content: newContent,
    sha: sha,
    committer: { name: "Netlify Function", email: "netlify@example.com" }
  };

  const putRes = await fetch(apiBase, {
    method: "PUT",
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
    body: JSON.stringify(putBody)
  });

  if (!putRes.ok) {
    const txt = await putRes.text();
    return { statusCode: 500, body: `GitHub PUT failed: ${putRes.status} ${txt}` };
  }

  return { statusCode: 200, body: JSON.stringify({ success: true, added: newEntry }) };
};

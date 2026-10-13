import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const a = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, opts),
  b = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, opts),
  anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, opts);
const suffix = randomUUID(),
  emails = [
    `forma-qa-${suffix}-a@example.test`,
    `forma-qa-${suffix}-b@example.test`,
  ];
const password = randomUUID() + "Aa!";
try {
  const first = await a.auth.signUp({ email: emails[0], password });
  assert.ifError(first.error);
  const second = await b.auth.signUp({ email: emails[1], password });
  assert.ifError(second.error);
  const id = randomUUID(),
    document = {
      id,
      name: "Isolated account proof",
      width: 1080,
      height: 1080,
      pages: [
        {
          id: randomUUID(),
          name: "Proof",
          thumbnail: "",
          data: { objects: [], background: "#ffffff" },
        },
      ],
      updatedAt: new Date().toISOString(),
    };
  const insert = await a.from("designs").insert({
    id,
    owner_id: first.data.user.id,
    name: document.name,
    document,
  });
  assert.ifError(insert.error);
  const own = await a.from("designs").select("document").eq("id", id);
  assert.ifError(own.error);
  assert.equal(own.data.length, 1);
  const other = await b.from("designs").select("id").eq("id", id);
  assert.ifError(other.error);
  assert.equal(other.data.length, 0);
  const stranger = await anon.from("designs").select("id").eq("id", id);
  assert.ok(stranger.error || stranger.data.length === 0);
  const forged = await b.from("designs").insert({
    id: randomUUID(),
    owner_id: first.data.user.id,
    name: "Forged owner",
    document,
  });
  assert.ok(forged.error);
  const update = await b
    .from("designs")
    .update({ name: "Unauthorized edit" })
    .eq("id", id)
    .select("id");
  assert.equal(update.data?.length || 0, 0);
  const intact = await a.from("designs").select("name").eq("id", id).single();
  assert.equal(intact.data.name, document.name);
  console.log(
    "PASS: signup, account save/read, anonymous denial, cross-account read/write isolation, and owner validation.",
  );
} finally {
  await a.auth.signOut();
  await b.auth.signOut();
  const sql = `DELETE FROM auth.users WHERE email IN ('${emails[0]}','${emails[1]}');`;
  const cleanup = spawnSync(
    "docker",
    [
      "exec",
      "supabase_db_forma-studio",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      sql,
    ],
    { windowsHide: true, encoding: "utf8" },
  );
  if (cleanup.status !== 0)
    throw new Error("Could not remove the two generated QA accounts.");
  console.log("Removed only the generated QA accounts and their test design.");
}

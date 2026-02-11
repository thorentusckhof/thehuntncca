const path = require("path");
require("dotenv").config();
const express = require("express");
const session = require("express-session");
const pg = require("pg");

const PgSession = require("connect-pg-simple")(session);
const { Pool } = pg;

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme";
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret";
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

const SCORE_BASE = 100000;
const BONUS_FIRST = 10000;
const BONUS_SECOND = 5000;
const BONUS_THIRD = 2500;

const houseOptions = ["Athanasius", "Anselm", "Augustine", "Boniface"];

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
});

function normalizeAnswer(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function requireUser(req, res, next) {
  if (!req.session.userId) return res.redirect("/");
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.redirect("/admin/login");
  next();
}

function formatPlace(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
}

function getDisplayName(user) {
  const first = String(user.first_name || "").trim();
  const last = String(user.last_name || "").trim();
  const fullName = `${first} ${last}`.trim();
  return fullName || user.username;
}

function slugifyUsername(value) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
  return slug || "hunter";
}

async function generateUniqueUsername(firstName, lastName) {
  const base = slugifyUsername(`${firstName}${lastName}`);
  for (let i = 0; i < 5000; i += 1) {
    const candidate = i === 0 ? base : `${base}${i}`;
    const existing = await pool.query("SELECT id FROM users WHERE username = $1", [candidate]);
    if (existing.rowCount === 0) return candidate;
  }
  return `${base}${Date.now()}`;
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function toInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      first_name TEXT,
      last_name TEXT,
      house TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS puzzles (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      clue TEXT NOT NULL,
      answer TEXT NOT NULL,
      group_index INTEGER NOT NULL DEFAULT 1,
      order_index INTEGER NOT NULL,
      media_url TEXT,
      media_embed_html TEXT,
      custom_html TEXT,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gates (
      id BIGSERIAL PRIMARY KEY,
      group_index INTEGER UNIQUE NOT NULL,
      title TEXT NOT NULL,
      content_html TEXT NOT NULL,
      unlock_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS progress (
      user_id BIGINT NOT NULL,
      puzzle_id BIGINT NOT NULL,
      solved_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (user_id, puzzle_id)
    );

    CREATE TABLE IF NOT EXISTS runs (
      user_id BIGINT PRIMARY KEY,
      start_time TIMESTAMPTZ NOT NULL,
      finish_time TIMESTAMPTZ,
      total_seconds INTEGER,
      rank INTEGER,
      score INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_progress_user_id ON progress(user_id);
    CREATE INDEX IF NOT EXISTS idx_progress_puzzle_id ON progress(puzzle_id);
    CREATE INDEX IF NOT EXISTS idx_puzzles_group_order ON puzzles(group_index, order_index);
    CREATE INDEX IF NOT EXISTS idx_gates_group_index ON gates(group_index);
  `);

  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT");
  await pool.query("ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS group_index INTEGER NOT NULL DEFAULT 1");
  await pool.query("ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS media_url TEXT");
  await pool.query("ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS media_embed_html TEXT");
  await pool.query("ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS custom_html TEXT");

  const countResult = await pool.query("SELECT COUNT(*)::int AS c FROM puzzles");
  if (countResult.rows[0].c > 0) return;

  await pool.query(
    `INSERT INTO puzzles (title, clue, answer, group_index, order_index, created_at)
     VALUES
     ($1, $2, $3, $4, $5, NOW()),
     ($6, $7, $8, $9, $10, NOW())`,
    [
      "Welcome",
      "I speak without a mouth and hear without ears. I have nobody, but I come alive with wind. What am I?",
      "echo",
      1,
      1,
      "Second",
      "What has keys but can't open locks?",
      "piano",
      1,
      2
    ]
  );
}

async function getUser(req) {
  if (!req.session.userId) return null;
  const result = await pool.query("SELECT * FROM users WHERE id = $1", [req.session.userId]);
  return result.rows[0] || null;
}

async function ensureRun(userId) {
  await pool.query(
    `INSERT INTO runs (user_id, start_time)
     VALUES ($1, NOW())
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
  const result = await pool.query("SELECT * FROM runs WHERE user_id = $1", [userId]);
  return result.rows[0];
}

async function getOverallPlace(userId) {
  const result = await pool.query(
    `SELECT
       u.id AS user_id,
       COALESCE(pc.solved_count, 0) AS solved_count,
       CASE WHEN r.finish_time IS NOT NULL THEN 1 ELSE 0 END AS finished,
       COALESCE(
         r.total_seconds,
         CAST(EXTRACT(EPOCH FROM (NOW() - r.start_time)) AS INTEGER),
         99999999
       ) AS elapsed_seconds
     FROM users u
     LEFT JOIN runs r ON r.user_id = u.id
     LEFT JOIN (
       SELECT user_id, COUNT(*) AS solved_count
       FROM progress
       GROUP BY user_id
     ) pc ON pc.user_id = u.id
     ORDER BY solved_count DESC, finished DESC, elapsed_seconds ASC, u.created_at ASC`
  );
  const index = result.rows.findIndex((row) => Number(row.user_id) === Number(userId));
  return index === -1 ? null : index + 1;
}

async function getHouseScores() {
  const result = await pool.query(
    `SELECT u.house, COALESCE(SUM(r.score), 0)::int AS total_score
     FROM users u
     LEFT JOIN runs r ON r.user_id = u.id AND r.finish_time IS NOT NULL
     GROUP BY u.house
     ORDER BY total_score DESC, u.house ASC`
  );

  const scoreMap = new Map(result.rows.map((row) => [row.house, Number(row.total_score)]));
  const normalized = houseOptions.map((house) => ({
    house,
    total_score: scoreMap.get(house) || 0
  }));
  normalized.sort((a, b) => b.total_score - a.total_score || a.house.localeCompare(b.house));
  return normalized;
}

async function getGameState(userId) {
  const [puzzlesResult, gatesResult, progressResult] = await Promise.all([
    pool.query("SELECT * FROM puzzles ORDER BY group_index ASC, order_index ASC, id ASC"),
    pool.query("SELECT * FROM gates ORDER BY group_index ASC"),
    pool.query("SELECT puzzle_id FROM progress WHERE user_id = $1", [userId])
  ]);

  const puzzles = puzzlesResult.rows;
  const gates = gatesResult.rows;
  const solvedSet = new Set(progressResult.rows.map((row) => Number(row.puzzle_id)));

  const puzzlesByGroup = new Map();
  for (const puzzle of puzzles) {
    const key = Number(puzzle.group_index);
    if (!puzzlesByGroup.has(key)) puzzlesByGroup.set(key, []);
    puzzlesByGroup.get(key).push(puzzle);
  }

  const gateByGroup = new Map(gates.map((gate) => [Number(gate.group_index), gate]));
  const groups = [...new Set(puzzles.map((p) => Number(p.group_index)))].sort((a, b) => a - b);

  const isGroupSolved = (groupIndex) => {
    const groupPuzzles = puzzlesByGroup.get(groupIndex) || [];
    if (groupPuzzles.length === 0) return true;
    return groupPuzzles.every((p) => solvedSet.has(Number(p.id)));
  };

  const allPreviousGroupsSolved = (groupIndex) => {
    for (const g of groups) {
      if (g >= groupIndex) break;
      if (!isGroupSolved(g)) return false;
    }
    return true;
  };

  const now = new Date();
  const sidebarItems = [];
  let firstPlayablePuzzle = null;
  let blockingGate = null;

  for (const groupIndex of groups) {
    const gate = gateByGroup.get(groupIndex);
    const previousSolved = allPreviousGroupsSolved(groupIndex);
    const gateLocked = Boolean(gate && new Date(gate.unlock_at) > now);
    const gateCanView = Boolean(gate && previousSolved);

    if (gate) {
      const unlockAt = new Date(gate.unlock_at);
      const secondsUntilOpen = Math.max(0, Math.floor((unlockAt.getTime() - now.getTime()) / 1000));
      const gateItem = {
        type: "gate",
        id: Number(gate.id),
        groupIndex,
        title: gate.title,
        contentHtml: gate.content_html,
        unlockAtIso: unlockAt.toISOString(),
        locked: gateLocked,
        canView: gateCanView,
        previousSolved,
        secondsUntilOpen
      };
      sidebarItems.push(gateItem);
      if (!blockingGate && gateLocked && gateCanView) {
        blockingGate = gateItem;
      }
    }

    const groupPuzzles = puzzlesByGroup.get(groupIndex) || [];
    const groupAccessible = previousSolved && !gateLocked;
    let unlockNextInGroup = true;

    for (const puzzle of groupPuzzles) {
      const solved = solvedSet.has(Number(puzzle.id));
      const unlocked = groupAccessible && (solved || unlockNextInGroup);
      if (groupAccessible && !solved && unlockNextInGroup) unlockNextInGroup = false;

      const puzzleItem = {
        type: "puzzle",
        ...puzzle,
        id: Number(puzzle.id),
        groupIndex,
        solved,
        unlocked
      };

      sidebarItems.push(puzzleItem);

      if (!firstPlayablePuzzle && unlocked && !solved) {
        firstPlayablePuzzle = puzzleItem;
      }
    }
  }

  const totalPuzzleCount = puzzles.length;
  const solvedCount = solvedSet.size;
  const allSolved = totalPuzzleCount > 0 && solvedCount >= totalPuzzleCount;

  return {
    sidebarItems,
    firstPlayablePuzzle,
    blockingGate,
    allSolved,
    solvedSet
  };
}

async function computeAndStoreFinish(userId) {
  const runResult = await pool.query("SELECT * FROM runs WHERE user_id = $1", [userId]);
  const run = runResult.rows[0];
  if (run.finish_time) return run;

  const start = new Date(run.start_time);
  const totalSeconds = Math.max(1, Math.floor((Date.now() - start.getTime()) / 1000));
  const finishedCountResult = await pool.query(
    "SELECT COUNT(*)::int AS c FROM runs WHERE finish_time IS NOT NULL"
  );
  const rank = finishedCountResult.rows[0].c + 1;

  let score = Math.max(0, SCORE_BASE - totalSeconds);
  if (rank === 1) score += BONUS_FIRST;
  if (rank === 2) score += BONUS_SECOND;
  if (rank === 3) score += BONUS_THIRD;

  await pool.query(
    `UPDATE runs
     SET finish_time = NOW(), total_seconds = $1, rank = $2, score = $3
     WHERE user_id = $4`,
    [totalSeconds, rank, score, userId]
  );

  const updatedRunResult = await pool.query("SELECT * FROM runs WHERE user_id = $1", [userId]);
  return updatedRunResult.rows[0];
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 6 }
  })
);
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  if (!req.session.userId) return res.render("landing");
  res.redirect("/play");
});

app.get("/begin", (req, res) => {
  if (req.session.userId) return res.redirect("/play");
  res.render("intro");
});

app.get("/return", (req, res) => {
  if (req.session.userId) return res.redirect("/play");
  res.render("return", { error: null });
});

app.post(
  "/return",
  asyncHandler(async (req, res) => {
    const username = String(req.body.username || "").trim();
    if (!username) return res.render("return", { error: "Username is required." });

    const userResult = await pool.query("SELECT * FROM users WHERE LOWER(username) = LOWER($1)", [username]);
    const user = userResult.rows[0];
    if (!user) return res.render("return", { error: "No account found with that username." });

    req.session.userId = Number(user.id);
    await ensureRun(req.session.userId);
    return res.redirect("/play");
  })
);

app.get("/login", (req, res) => {
  if (req.session.userId) return res.redirect("/play");
  res.render("login", { houses: houseOptions, error: null });
});

app.post(
  "/login",
  asyncHandler(async (req, res) => {
    let username = String(req.body.username || "").trim();
    const firstName = String(req.body.first_name || "").trim();
    const lastName = String(req.body.last_name || "").trim();
    const house = String(req.body.house || "").trim();

    if (!firstName || !lastName) {
      return res.render("login", { houses: houseOptions, error: "First and last name are required." });
    }
    if (!houseOptions.includes(house)) {
      return res.render("login", { houses: houseOptions, error: "Please select a valid house." });
    }

    if (!username) username = await generateUniqueUsername(firstName, lastName);

    let userResult = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    let user = userResult.rows[0];

    if (!user) {
      const insertResult = await pool.query(
        `INSERT INTO users (username, first_name, last_name, house, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING *`,
        [username, firstName, lastName, house]
      );
      user = insertResult.rows[0];
    } else {
      const updateResult = await pool.query(
        `UPDATE users
         SET first_name = $1, last_name = $2, house = $3
         WHERE id = $4
         RETURNING *`,
        [firstName, lastName, house, user.id]
      );
      user = updateResult.rows[0];
    }

    req.session.userId = Number(user.id);
    await ensureRun(req.session.userId);
    res.redirect("/play");
  })
);

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

app.get(
  "/account",
  requireUser,
  asyncHandler(async (req, res) => {
    const user = await getUser(req);
    res.render("account", { user, error: null, success: null });
  })
);

app.post(
  "/account",
  requireUser,
  asyncHandler(async (req, res) => {
    const user = await getUser(req);
    const firstName = String(req.body.first_name || "").trim();
    const lastName = String(req.body.last_name || "").trim();
    if (!firstName || !lastName) {
      return res.render("account", {
        user,
        error: "Both first and last name are required.",
        success: null
      });
    }

    const updatedResult = await pool.query(
      `UPDATE users SET first_name = $1, last_name = $2 WHERE id = $3 RETURNING *`,
      [firstName, lastName, user.id]
    );

    res.render("account", {
      user: updatedResult.rows[0],
      error: null,
      success: "Account updated."
    });
  })
);

app.get(
  "/play",
  requireUser,
  asyncHandler(async (req, res) => {
    const user = await getUser(req);
    const run = await ensureRun(user.id);
    const gameState = await getGameState(user.id);

    if (gameState.allSolved) return res.redirect("/congratulations");

    const place = await getOverallPlace(user.id);
    const houseScores = await getHouseScores();

    res.render("play", {
      user,
      displayName: getDisplayName(user),
      run,
      sidebarItems: gameState.sidebarItems,
      nextPuzzle: gameState.firstPlayablePuzzle || null,
      blockingGate: gameState.blockingGate || null,
      placeText: place ? formatPlace(place) : "unranked",
      houseScores,
      error: null
    });
  })
);

app.get(
  "/puzzle/:id",
  requireUser,
  asyncHandler(async (req, res) => {
    const puzzleId = Number(req.params.id);
    const user = await getUser(req);
    const run = await ensureRun(user.id);
    const gameState = await getGameState(user.id);

    if (gameState.allSolved) return res.redirect("/congratulations");

    const puzzle = gameState.sidebarItems.find(
      (item) => item.type === "puzzle" && item.id === puzzleId
    );

    if (!puzzle) return res.redirect("/play");
    if (!puzzle.unlocked) {
      if (gameState.blockingGate) return res.redirect(`/gate/${gameState.blockingGate.groupIndex}`);
      return res.redirect("/play");
    }

    const place = await getOverallPlace(user.id);
    const houseScores = await getHouseScores();

    return res.render("puzzle", {
      user,
      displayName: getDisplayName(user),
      puzzle,
      run,
      sidebarItems: gameState.sidebarItems,
      placeText: place ? formatPlace(place) : "unranked",
      houseScores,
      error: null
    });
  })
);

app.get(
  "/gate/:groupIndex",
  requireUser,
  asyncHandler(async (req, res) => {
    const groupIndex = Number(req.params.groupIndex);
    const user = await getUser(req);
    const run = await ensureRun(user.id);
    const gameState = await getGameState(user.id);

    if (gameState.allSolved) return res.redirect("/congratulations");

    const gateItem = gameState.sidebarItems.find(
      (item) => item.type === "gate" && item.groupIndex === groupIndex
    );

    if (!gateItem || !gateItem.canView || !gateItem.locked) return res.redirect("/play");

    const place = await getOverallPlace(user.id);
    const houseScores = await getHouseScores();

    res.render("gate", {
      user,
      displayName: getDisplayName(user),
      gate: gateItem,
      run,
      sidebarItems: gameState.sidebarItems,
      placeText: place ? formatPlace(place) : "unranked",
      houseScores,
      error: null
    });
  })
);

app.post(
  "/answer",
  requireUser,
  asyncHandler(async (req, res) => {
    const user = await getUser(req);
    const puzzleId = Number(req.body.puzzle_id);
    const answer = normalizeAnswer(req.body.answer);

    const gameState = await getGameState(user.id);
    const allowedPuzzle = gameState.sidebarItems.find(
      (item) => item.type === "puzzle" && item.id === puzzleId && item.unlocked
    );

    if (!allowedPuzzle) {
      if (gameState.blockingGate) return res.redirect(`/gate/${gameState.blockingGate.groupIndex}`);
      return res.redirect("/play");
    }

    const puzzleResult = await pool.query("SELECT * FROM puzzles WHERE id = $1", [puzzleId]);
    const puzzle = puzzleResult.rows[0];
    if (!puzzle) return res.redirect("/play");

    const correct = normalizeAnswer(puzzle.answer) === answer;
    if (!correct) {
      const run = await ensureRun(user.id);
      const place = await getOverallPlace(user.id);
      const houseScores = await getHouseScores();
      return res.render("puzzle", {
        user,
        displayName: getDisplayName(user),
        puzzle: { ...allowedPuzzle },
        run,
        sidebarItems: gameState.sidebarItems,
        placeText: place ? formatPlace(place) : "unranked",
        houseScores,
        error: "Not quite. Try again."
      });
    }

    await pool.query(
      `INSERT INTO progress (user_id, puzzle_id, solved_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, puzzle_id) DO NOTHING`,
      [user.id, puzzle.id]
    );

    const nextState = await getGameState(user.id);

    if (nextState.allSolved) {
      await computeAndStoreFinish(user.id);
      return res.redirect("/congratulations");
    }

    if (nextState.blockingGate && !nextState.firstPlayablePuzzle) {
      return res.redirect(`/gate/${nextState.blockingGate.groupIndex}`);
    }

    const nextPuzzle = nextState.firstPlayablePuzzle;
    if (!nextPuzzle) return res.redirect("/play");

    return res.redirect(`/puzzle/${nextPuzzle.id}`);
  })
);

app.get(
  "/congratulations",
  requireUser,
  asyncHandler(async (req, res) => {
    const user = await getUser(req);
    const state = await getGameState(user.id);
    if (!state.allSolved) return res.redirect("/play");

    const finishedRun = await computeAndStoreFinish(user.id);
    res.render("congratulations", {
      user,
      displayName: getDisplayName(user),
      placeText: formatPlace(Number(finishedRun.rank)),
      run: finishedRun
    });
  })
);

app.get(
  "/leaderboard",
  requireUser,
  asyncHandler(async (req, res) => {
    const scoresResult = await pool.query(
      `SELECT u.username, u.first_name, u.last_name, u.house, r.total_seconds, r.rank, r.score
       FROM runs r
       JOIN users u ON u.id = r.user_id
       WHERE r.finish_time IS NOT NULL
       ORDER BY r.score DESC, r.total_seconds ASC`
    );

    const houseScores = await getHouseScores();

    res.render("leaderboard", {
      user: await getUser(req),
      scores: scoresResult.rows,
      houseScores
    });
  })
);

app.get("/admin/login", (req, res) => {
  res.render("admin-login", { error: null });
});

app.post("/admin/login", (req, res) => {
  const password = String(req.body.password || "");
  if (password !== ADMIN_PASSWORD) {
    return res.render("admin-login", { error: "Invalid password." });
  }
  req.session.isAdmin = true;
  return res.redirect("/admin");
});

app.post("/admin/logout", (req, res) => {
  req.session.isAdmin = false;
  res.redirect("/admin/login");
});

app.get(
  "/admin",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const [puzzlesResult, gatesResult] = await Promise.all([
      pool.query("SELECT * FROM puzzles ORDER BY group_index ASC, order_index ASC"),
      pool.query("SELECT * FROM gates ORDER BY group_index ASC")
    ]);
    res.render("admin", { puzzles: puzzlesResult.rows, gates: gatesResult.rows, error: null });
  })
);

app.post(
  "/admin/puzzles",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const title = String(req.body.title || "").trim();
    const clue = String(req.body.clue || "").trim();
    const answer = String(req.body.answer || "").trim();
    const groupIndex = toInt(req.body.group_index, 1);
    const orderIndex = toInt(req.body.order_index, 0);
    const mediaUrl = String(req.body.media_url || "").trim();
    const mediaEmbedHtml = String(req.body.media_embed_html || "").trim();
    const customHtml = String(req.body.custom_html || "").trim();

    if (!title || !clue || !answer || !orderIndex || !groupIndex) {
      const [puzzlesResult, gatesResult] = await Promise.all([
        pool.query("SELECT * FROM puzzles ORDER BY group_index ASC, order_index ASC"),
        pool.query("SELECT * FROM gates ORDER BY group_index ASC")
      ]);
      return res.render("admin", {
        puzzles: puzzlesResult.rows,
        gates: gatesResult.rows,
        error: "Title, clue, answer, group, and order are required."
      });
    }

    await pool.query(
      `INSERT INTO puzzles
       (title, clue, answer, group_index, order_index, media_url, media_embed_html, custom_html, created_at)
       VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), NULLIF($7, ''), NULLIF($8, ''), NOW())`,
      [title, clue, answer, groupIndex, orderIndex, mediaUrl, mediaEmbedHtml, customHtml]
    );

    return res.redirect("/admin");
  })
);

app.post(
  "/admin/puzzles/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const title = String(req.body.title || "").trim();
    const clue = String(req.body.clue || "").trim();
    const answer = String(req.body.answer || "").trim();
    const groupIndex = toInt(req.body.group_index, 1);
    const orderIndex = toInt(req.body.order_index, 0);
    const mediaUrl = String(req.body.media_url || "").trim();
    const mediaEmbedHtml = String(req.body.media_embed_html || "").trim();
    const customHtml = String(req.body.custom_html || "").trim();

    await pool.query(
      `UPDATE puzzles
       SET title = $1,
           clue = $2,
           answer = $3,
           group_index = $4,
           order_index = $5,
           media_url = NULLIF($6, ''),
           media_embed_html = NULLIF($7, ''),
           custom_html = NULLIF($8, '')
       WHERE id = $9`,
      [title, clue, answer, groupIndex, orderIndex, mediaUrl, mediaEmbedHtml, customHtml, id]
    );

    return res.redirect("/admin");
  })
);

app.post(
  "/admin/puzzles/:id/delete",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await pool.query("DELETE FROM puzzles WHERE id = $1", [id]);
    await pool.query("DELETE FROM progress WHERE puzzle_id = $1", [id]);
    return res.redirect("/admin");
  })
);

app.post(
  "/admin/gates",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const groupIndex = toInt(req.body.group_index, 0);
    const title = String(req.body.title || "").trim();
    const unlockAt = String(req.body.unlock_at || "").trim();
    const contentHtml = String(req.body.content_html || "").trim();

    if (!groupIndex || !title || !unlockAt || !contentHtml) {
      const [puzzlesResult, gatesResult] = await Promise.all([
        pool.query("SELECT * FROM puzzles ORDER BY group_index ASC, order_index ASC"),
        pool.query("SELECT * FROM gates ORDER BY group_index ASC")
      ]);
      return res.render("admin", {
        puzzles: puzzlesResult.rows,
        gates: gatesResult.rows,
        error: "Gate group, title, unlock time, and content are required."
      });
    }

    await pool.query(
      `INSERT INTO gates (group_index, title, content_html, unlock_at, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (group_index)
       DO UPDATE SET title = EXCLUDED.title, content_html = EXCLUDED.content_html, unlock_at = EXCLUDED.unlock_at`,
      [groupIndex, title, contentHtml, unlockAt]
    );

    return res.redirect("/admin");
  })
);

app.post(
  "/admin/gates/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const groupIndex = toInt(req.body.group_index, 0);
    const title = String(req.body.title || "").trim();
    const unlockAt = String(req.body.unlock_at || "").trim();
    const contentHtml = String(req.body.content_html || "").trim();

    await pool.query(
      `UPDATE gates
       SET group_index = $1, title = $2, unlock_at = $3, content_html = $4
       WHERE id = $5`,
      [groupIndex, title, unlockAt, contentHtml, id]
    );

    return res.redirect("/admin");
  })
);

app.post(
  "/admin/gates/:id/delete",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await pool.query("DELETE FROM gates WHERE id = $1", [id]);
    return res.redirect("/admin");
  })
);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("Internal Server Error");
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Scavenger hunt app running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start app:", err);
  process.exit(1);
});

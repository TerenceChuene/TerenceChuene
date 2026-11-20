#!/usr/bin/env node
/**
 * ResQMe-style resilient GitFut dashboard updater.
 * Country locked to ZA.
 * Supports cached fallback when GitFut API is unavailable.
 */

import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  renameSync,
} from "node:fs";

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const USERNAME = process.env.GITHUB_USERNAME || "TerenceChuene";
const COUNTRY = (process.env.GITFUT_COUNTRY || "ZA").toUpperCase();

const START = "<!-- FIFA-CARD:START -->";
const END = "<!-- FIFA-CARD:END -->";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const readmePath = join(root, "README.md");
const assetsDir = join(root, "assets");

const cardPath = join(assetsDir, "fifa-card.png");
const dashPath = join(assetsDir, "scout-report.png");
const cachePath = join(assetsDir, "scout-card.json");

const composePath = join(__dirname, "compose_dashboard.py");

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cardUrls(login, bust) {
  return {
    page: `https://gitfut.com/${login}?country=${COUNTRY}`,
    image: `https://gitfut.com/${login}.png?country=${COUNTRY}&t=${bust}`,
    api: `https://gitfut.com/api/card/${login}?country=${COUNTRY}`,
  };
}

function estimateRanks(ovr) {
  const github = Math.max(
    0.1,
    +(4.2 * (60 / Math.max(1, ovr)) ** 2).toFixed(1)
  );

  const active = Math.max(
    1,
    Math.round(19 * (60 / Math.max(1, ovr)) ** 1.4)
  );

  return { github, active };
}

function buildReadmeSection(card, bust) {
  const urls = cardUrls(card.login, bust);

  const displayName = (card.name || card.login)
    .trim()
    .toUpperCase();

  return `${START}
<!-- Auto-updated by update-fifa-card.yml -->

<p align="center">
  <a href="${urls.page}">
    <img src="./assets/scout-report.png?t=${bust}" alt="${esc(displayName)} FIFA scout report" width="920" />
  </a>
</p>

<p align="center">
  <a href="${urls.page}"><strong>Open live scout report →</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/${card.login}">@${card.login}</a>
  &nbsp;·&nbsp;
  🇿🇦 <code>ZA</code>
  &nbsp;·&nbsp;
  <code>${card.overall} OVR</code> · <code>${card.position}</code> · <code>${card.finishLabel || card.finish}</code>
</p>

${END}`;
}

function saveCache(card) {
  const tempPath = `${cachePath}.tmp`;

  writeFileSync(tempPath, JSON.stringify(card, null, 2));
  renameSync(tempPath, cachePath);
}

function loadCache() {
  if (!existsSync(cachePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(cachePath, "utf8"));
  } catch {
    console.warn("Warning: Cached scout data is invalid.");
    return null;
  }
}

async function fetchLiveCard() {
  const bust = Date.now().toString(36);
  const urls = cardUrls(USERNAME, bust);

  console.log("Fetching latest GitFut scout data...");

  const response = await fetch(urls.api, {
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 1500);

    const error = new Error(
      `GitFut API returned HTTP ${response.status} ${response.statusText}\n${body}`
    );

    error.status = response.status;
    throw error;
  }

  const card = await response.json();

  if (
    !card ||
    !card.login ||
    !Number.isFinite(Number(card.overall)) ||
    !card.position
  ) {
    throw new Error("GitFut returned incomplete or invalid card data.");
  }

  console.log("Downloading FIFA card image...");

  const imageResponse = await fetch(cardUrls(card.login, bust).image, {
    headers: {
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!imageResponse.ok) {
    throw new Error(
      `Card image failed: HTTP ${imageResponse.status}`
    );
  }

  const imageBuffer = Buffer.from(
    await imageResponse.arrayBuffer()
  );

  if (
    imageBuffer.length < 8 ||
    imageBuffer[0] !== 0x89 ||
    imageBuffer[1] !== 0x50 ||
    imageBuffer[2] !== 0x4e ||
    imageBuffer[3] !== 0x47
  ) {
    throw new Error("GitFut returned an invalid PNG image.");
  }

  // Only update cached data after both requests succeed.
  mkdirSync(assetsDir, { recursive: true });

  const tempImage = `${cardPath}.tmp`;

  writeFileSync(tempImage, imageBuffer);
  renameSync(tempImage, cardPath);

  card.country = COUNTRY.toLowerCase();

  saveCache(card);

  console.log("Live scout data successfully cached.");

  return card;
}

function composeDashboard(card) {
  const ranks = estimateRanks(Number(card.overall));

  const payload = {
    card_path: cardPath,
    out_path: dashPath,
    country: COUNTRY,

    name: (card.name || card.login).trim().toUpperCase(),
    login: card.login,
    overall: card.overall,
    finish: (card.finishLabel || card.finish || "BRONZE").toUpperCase(),
    position: card.position,
    archetype: card.archetype,
    blurb: card.archetypeBlurb,

    language:
      card.topLanguage ||
      card.languageLogo?.name ||
      "—",

    skill_moves: card.report?.skillMoves ?? 0,
    weak_foot: card.report?.weakFoot ?? 0,

    work_rate:
      `${(card.report?.workRate?.attack || "—").toUpperCase()} / ` +
      `${(card.report?.workRate?.defense || "—").toUpperCase()}`,

    style: (card.report?.style || "—").toUpperCase(),

    playstyles:
      card.report?.playstyles?.length > 0
        ? card.report.playstyles
            .map((p) => p.name || p)
            .join(" · ")
        : "No standout traits yet — keep shipping.",

    metrics: card.report?.metrics ?? [],
    ranks,

    scouted_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  };

  console.log("Rebuilding scout dashboard...");

  const py = spawnSync("python3", [composePath], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  if (py.status !== 0) {
    throw new Error(
      `compose_dashboard.py failed:\n${py.stderr || py.stdout}`
    );
  }
}

function updateReadme(card) {
  const bust = Date.now().toString(36);
  const readme = readFileSync(readmePath, "utf8");

  const startIndex = readme.indexOf(START);
  const endIndex = readme.indexOf(END);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error("README.md FIFA card markers are missing or invalid.");
  }

  const next = buildReadmeSection(card, bust);

  const updated =
    readme.slice(0, startIndex) +
    next +
    readme.slice(endIndex + END.length);

  writeFileSync(readmePath, updated);
}

async function main() {
  mkdirSync(assetsDir, { recursive: true });

  let card;
  let usingCache = false;

  try {
    card = await fetchLiveCard();
  } catch (error) {
    console.error(`Live GitFut request failed: ${error.message}`);

    console.warn("Attempting cached scout fallback...");

    card = loadCache();

    if (!card || !existsSync(cardPath)) {
      throw new Error(
        "No valid cached scout data or FIFA image available. " +
        "Cannot rebuild dashboard."
      );
    }

    usingCache = true;
  }

  composeDashboard(card);
  updateReadme(card);

  console.log(
    `${usingCache ? "Cached" : "Live"} dashboard updated: ` +
    `${card.overall} OVR ${card.position} · ZA`
  );
}

main().catch((error) => {
  console.error("GitFut dashboard update failed:", error.message);
  process.exit(1);
});

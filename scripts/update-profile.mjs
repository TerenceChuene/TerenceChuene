#!/usr/bin/env node
/**
 * Re-scouts GitFut and rebuilds a dashboard PNG matching the scout-report UI.
 * Country locked to ZA. README embeds the generated image.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  const github = Math.max(0.1, +(4.2 * (60 / Math.max(1, ovr)) ** 2).toFixed(1));
  const active = Math.max(1, Math.round(19 * (60 / Math.max(1, ovr)) ** 1.4));
  return { github, active };
}

function buildReadmeSection(card, bust) {
  const urls = cardUrls(card.login, bust);
  const displayName = (card.name || card.login).trim().toUpperCase();
  return `${START}
<!-- Auto-updated by .github/workflows/update-fifa-card.yml — do not edit by hand -->

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

async function main() {
  const bust = Date.now().toString(36);
  const apiUrl = `https://gitfut.com/api/card/${USERNAME}?country=${COUNTRY}&t=${bust}`;
  const res = await fetch(apiUrl, {
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
  });
  if (!res.ok) {
    throw new Error(`GitFut scout failed: ${res.status} ${res.statusText}`);
  }
  const card = await res.json();
  card.country = COUNTRY.toLowerCase();

  const imgRes = await fetch(cardUrls(card.login, bust).image, {
    headers: { "Cache-Control": "no-cache" },
  });
  if (!imgRes.ok) {
    throw new Error(`Card image failed: ${imgRes.status}`);
  }

  mkdirSync(assetsDir, { recursive: true });
  const cardBuf = Buffer.from(await imgRes.arrayBuffer());
  writeFileSync(cardPath, cardBuf);

  const ranks = estimateRanks(card.overall);
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
    language: card.topLanguage || card.languageLogo?.name || "—",
    skill_moves: card.report?.skillMoves ?? 0,
    weak_foot: card.report?.weakFoot ?? 0,
    work_rate: `${(card.report?.workRate?.attack || "—").toUpperCase()} / ${(card.report?.workRate?.defense || "—").toUpperCase()}`,
    style: (card.report?.style || "—").toUpperCase(),
    playstyles:
      card.report?.playstyles?.length > 0
        ? card.report.playstyles.map((p) => p.name || p).join(" · ")
        : "No standout traits yet — keep shipping.",
    metrics: card.report?.metrics ?? [],
    ranks,
    scouted_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  };

  const py = spawnSync("python3", [composePath], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (py.status !== 0) {
    throw new Error(`compose_dashboard.py failed:\n${py.stderr || py.stdout}`);
  }

  const readme = readFileSync(readmePath, "utf8");
  if (!readme.includes(START) || !readme.includes(END)) {
    throw new Error(`README.md missing ${START} / ${END} markers`);
  }

  const next = buildReadmeSection(card, bust);
  const updated =
    readme.slice(0, readme.indexOf(START)) +
    next +
    readme.slice(readme.indexOf(END) + END.length);

  writeFileSync(readmePath, updated);
  console.log(
    `Dashboard PNG updated: ${card.overall} OVR ${card.position} · ZA · ${dashPath}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

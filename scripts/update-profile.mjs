#!/usr/bin/env node
/**
 * Re-scouts the GitFut card and rewrites the auto-managed README section.
 * Always forces country=ZA on the live card image + scout links.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const USERNAME = process.env.GITHUB_USERNAME || "TerenceChuene";
const COUNTRY = (process.env.GITFUT_COUNTRY || "ZA").toUpperCase();
const START = "<!-- FIFA-CARD:START -->";
const END = "<!-- FIFA-CARD:END -->";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const readmePath = join(root, "README.md");

function stars(n, max = 5) {
  return "★".repeat(n) + "☆".repeat(Math.max(0, max - n));
}

function metricBar(score) {
  const filled = Math.round(Math.min(100, Math.max(0, score)) / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

function flagEmoji(code) {
  if (!code || code.length !== 2) return "";
  const A = 0x1f1e6;
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(A + c.charCodeAt(0) - 65))
    .join("");
}

function cardUrls(login, bust) {
  const qs = `country=${COUNTRY}&t=${bust}`;
  return {
    page: `https://gitfut.com/${login}?country=${COUNTRY}`,
    image: `https://gitfut.com/${login}.png?${qs}`,
    api: `https://gitfut.com/api/card/${login}?country=${COUNTRY}`,
  };
}

function buildSection(card, bust) {
  const {
    name,
    login,
    overall,
    baseOVR,
    finishLabel,
    finish,
    position,
    family,
    archetype,
    archetypeBlurb,
    topLanguage,
    languageLogo,
    club,
    country,
    stats,
    report,
    years = [],
    awards = [],
    legacy,
  } = card;

  const urls = cardUrls(login, bust);
  const displayName = (name || login).trim().toUpperCase();
  const countryCode = (country || COUNTRY).toUpperCase();
  const flag = flagEmoji(countryCode);
  const metrics = report?.metrics ?? [];
  const wr = report?.workRate ?? { attack: "—", defense: "—" };
  const reasons = report?.reasons ?? {};
  const playstyles =
    report?.playstyles?.length > 0
      ? report.playstyles.map((p) => p.name || p).join(" · ")
      : "No standout traits yet — keep shipping.";

  const metricRows = metrics
    .map(
      (m) =>
        `| **${m.label}** | ${m.value} ${m.unit} | \`${metricBar(m.score)}\` **${m.score}** |`
    )
    .join("\n");

  const yearRows =
    years.length > 0
      ? years
          .map(
            (y) =>
              `| **${y.year}** | ${y.commits} | ${y.prs} | ${y.reviews} | ${y.issues} | ${y.restricted ?? 0} |`
          )
          .join("\n")
      : "| — | — | — | — | — | — |";

  const awardLines =
    awards.length > 0
      ? awards.map((a) => `- **${a.name || a.title || a}**`).join("\n")
      : "_No awards yet — keep shipping._";

  const langName = topLanguage || languageLogo?.name || "—";
  const legacyL =
    typeof legacy?.L === "number" ? legacy.L.toFixed(3) : String(legacy?.L ?? "—");
  const scoutedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  return `${START}
<!-- Auto-updated by .github/workflows/update-fifa-card.yml — do not edit by hand -->

<p align="center">
  <a href="${urls.page}">
    <img src="${urls.image}" alt="${login} GitFut FIFA card (${countryCode})" width="360" />
  </a>
</p>

<p align="center">
  <strong>${displayName}</strong><br/>
  ${flag} <code>${countryCode}</code>
  · <code>${overall} OVR</code> (base ${baseOVR ?? "—"})
  · <code>${finishLabel || finish || "—"}</code>
  · <code>${position}</code>
  · <em>${archetype}</em>
  · ${family || "—"}<br/>
  <sub>ONE TO WATCH — ${archetypeBlurb}</sub>
</p>

<p align="center">
  <a href="${urls.page}"><strong>Full scout report →</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/${login}">@${login}</a>
  &nbsp;·&nbsp;
  Club: <strong>${club || "neutral"}</strong>
  &nbsp;·&nbsp;
  Top language: <strong>${langName}</strong>
</p>

### Card stats (live)

| PAC | SHO | PAS | DRI | DEF | PHY |
|:---:|:---:|:---:|:---:|:---:|:---:|
| **${stats.pac}** | **${stats.sho}** | **${stats.pas}** | **${stats.dri}** | **${stats.def}** | **${stats.phy}** |

| Field | Value |
|:------|:------|
| **Overall** | ${overall} |
| **Base OVR** | ${baseOVR ?? "—"} |
| **Finish** | ${finishLabel || finish || "—"} |
| **Position** | ${position} |
| **Family** | ${family || "—"} |
| **Archetype** | ${archetype} |
| **Country** | ${flag} ${countryCode} |
| **Club** | ${club || "neutral"} |
| **Top language** | ${langName} |
| **Legacy (L)** | ${legacyL} |

### Attributes

| | | Why |
|:--|:--|:--|
| **Skill moves** | ${stars(report?.skillMoves ?? 0)} | ${reasons.skillMoves || "—"} |
| **Weak foot** | ${stars(report?.weakFoot ?? 0)} | ${reasons.weakFoot || "—"} |
| **Work rate** | ${wr.attack} / ${wr.defense} | ${reasons.workRate || "—"} |
| **Style** | ${report?.style ?? "—"} | ${reasons.style || "—"} |
| **Playstyles** | ${playstyles} | |

### Scouting metrics

| Signal | Raw | Score |
|:-------|----:|------:|
${metricRows}

### Season history

| Year | Commits | PRs | Reviews | Issues | Restricted |
|:----:|--------:|----:|--------:|-------:|-----------:|
${yearRows}

### Awards

${awardLines}

<sub>Last auto-scout: <code>${scoutedAt}</code> · country locked to <code>${COUNTRY}</code> · source <a href="${urls.api}">GitFut API</a></sub>

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
  // Always display ZA even if API omits/normalizes country
  card.country = COUNTRY.toLowerCase();

  const readme = readFileSync(readmePath, "utf8");
  if (!readme.includes(START) || !readme.includes(END)) {
    throw new Error(`README.md missing ${START} / ${END} markers`);
  }

  const next = buildSection(card, bust);
  const updated =
    readme.slice(0, readme.indexOf(START)) +
    next +
    readme.slice(readme.indexOf(END) + END.length);

  if (updated === readme) {
    console.log("No README changes.");
    return;
  }

  writeFileSync(readmePath, updated);
  console.log(
    `Updated card: ${card.overall} OVR ${card.position} ${card.finishLabel} · country=${COUNTRY}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

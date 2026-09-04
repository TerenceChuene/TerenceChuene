#!/usr/bin/env node
/**
 * Re-scouts the GitFut card and rewrites the auto-managed README section.
 * Triggered by GitHub Actions on a schedule and on push.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const USERNAME = process.env.GITHUB_USERNAME || "TerenceChuene";
const START = "<!-- FIFA-CARD:START -->";
const END = "<!-- FIFA-CARD:END -->";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const readmePath = join(root, "README.md");

function stars(n, max = 5) {
  return "★".repeat(n) + "☆".repeat(Math.max(0, max - n));
}

function metricBar(score) {
  const filled = Math.round(score / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

function buildSection(card, bust) {
  const {
    name,
    login,
    overall,
    finishLabel,
    position,
    archetype,
    archetypeBlurb,
    topLanguage,
    stats,
    report,
  } = card;

  const displayName = (name || login).trim().toUpperCase();
  const metrics = report?.metrics ?? [];
  const wr = report?.workRate ?? { attack: "—", defense: "—" };
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

  const scoutedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  return `${START}
<!-- Auto-updated by .github/workflows/update-fifa-card.yml — do not edit by hand -->

<p align="center">
  <a href="https://gitfut.com/${login}">
    <img src="https://gitfut.com/${login}.png?t=${bust}" alt="${login} GitFut FIFA card" width="360" />
  </a>
</p>

<p align="center">
  <strong>${displayName}</strong><br/>
  <code>${overall} OVR</code> · <code>${finishLabel}</code> · <code>${position}</code> · <em>${archetype}</em><br/>
  <sub>ONE TO WATCH — ${archetypeBlurb}</sub>
</p>

<p align="center">
  <a href="https://gitfut.com/${login}"><strong>Full scout report →</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/${login}">@${login}</a>
  &nbsp;·&nbsp;
  Top language: <strong>${topLanguage || "—"}</strong>
</p>

### Match ratings

| PAC | SHO | PAS | DRI | DEF | PHY |
|:---:|:---:|:---:|:---:|:---:|:---:|
| **${stats.pac}** | **${stats.sho}** | **${stats.pas}** | **${stats.dri}** | **${stats.def}** | **${stats.phy}** |

### Attributes

| | |
|:--|:--|
| **Skill moves** | ${stars(report?.skillMoves ?? 0)} |
| **Weak foot** | ${stars(report?.weakFoot ?? 0)} |
| **Work rate** | ${wr.attack} / ${wr.defense} |
| **Style** | ${report?.style ?? "—"} |
| **Playstyles** | ${playstyles} |

### Scouting metrics

| Signal | Raw | Score |
|:-------|----:|------:|
${metricRows}

<sub>Last auto-scout: <code>${scoutedAt}</code> · source <a href="https://gitfut.com/api/card/${login}">GitFut API</a></sub>

${END}`;
}

async function main() {
  const res = await fetch(`https://gitfut.com/api/card/${USERNAME}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`GitFut scout failed: ${res.status} ${res.statusText}`);
  }
  const card = await res.json();
  const bust = Date.now().toString(36);

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
    `Updated card: ${card.overall} OVR ${card.position} ${card.finishLabel}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

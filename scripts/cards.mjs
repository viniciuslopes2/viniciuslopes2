import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const palette = {
  bg: "#120E0B",
  line: "#2A1E16",
  accent: "#D9622B",
  soft: "#FFB27A",
  text: "#E8DCCF",
  muted: "#9C8B7C",
  bright: "#FFF4EA",
};

const langTones = ["#D9622B", "#FFB27A", "#B5521F", "#F2A65A", "#8A3F18", "#FFD8B5", "#6B3214", "#E8DCCF"];

const font = "'Segoe UI', Ubuntu, 'Helvetica Neue', sans-serif";

const query = `
query ($login: String!) {
  user(login: $login) {
    followers { totalCount }
    pullRequests { totalCount }
    issues { totalCount }
    repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, PULL_REQUEST, ISSUE, REPOSITORY]) { totalCount }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: { field: PUSHED_AT, direction: DESC }) {
      totalCount
      nodes {
        stargazerCount
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name } }
        }
      }
    }
    contributionsCollection {
      totalCommitContributions
      restrictedContributionsCount
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

async function fetchProfile(login, token) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "profile-cards",
    },
    body: JSON.stringify({ query, variables: { login } }),
  });

  const payload = await response.json();

  if (!response.ok || payload.errors) {
    throw new Error(JSON.stringify(payload.errors ?? payload));
  }

  return payload.data.user;
}

export function summarize(user) {
  const repos = user.repositories.nodes;
  const contributions = user.contributionsCollection;

  const languageTotals = new Map();
  for (const repo of repos) {
    for (const edge of repo.languages.edges) {
      languageTotals.set(edge.node.name, (languageTotals.get(edge.node.name) ?? 0) + edge.size);
    }
  }

  const days = contributions.contributionCalendar.weeks.flatMap((week) => week.contributionDays);

  return {
    commits: contributions.totalCommitContributions + contributions.restrictedContributionsCount,
    pullRequests: user.pullRequests.totalCount,
    issues: user.issues.totalCount,
    stars: repos.reduce((sum, repo) => sum + repo.stargazerCount, 0),
    followers: user.followers.totalCount,
    repositories: user.repositories.totalCount,
    contributedTo: user.repositoriesContributedTo.totalCount,
    yearContributions: contributions.contributionCalendar.totalContributions,
    languages: [...languageTotals.entries()].sort((a, b) => b[1] - a[1]),
    lastDays: days.slice(-31),
  };
}

function escape(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function frame(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${font}">
<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="10" fill="${palette.bg}" stroke="${palette.line}"/>
${body}
</svg>
`;
}

function title(text, x = 24, y = 36) {
  return `<text x="${x}" y="${y}" fill="${palette.accent}" font-size="17" font-weight="600">${escape(text)}</text>`;
}

const icons = {
  commit: "M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM4.07 7.25a4 4 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5h-3.32a4 4 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5Z",
  pull: "M4.75 1.5a2.25 2.25 0 0 0-.75 4.37v4.26a2.25 2.25 0 1 0 1.5 0V5.87A2.25 2.25 0 0 0 4.75 1.5Zm6.5 8.63V6.5A2.5 2.5 0 0 0 8.75 4h-1.2l1.03-1.03a.75.75 0 0 0-1.06-1.06L5.2 4.22a.75.75 0 0 0 0 1.06l2.32 2.31a.75.75 0 1 0 1.06-1.06L7.55 5.5h1.2a1 1 0 0 1 1 1v3.63a2.25 2.25 0 1 0 1.5 0Z",
  issue: "M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm0 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z",
  star: "M8 .25a.75.75 0 0 1 .67.42l1.88 3.8 4.2.62a.75.75 0 0 1 .41 1.28l-3.04 2.96.72 4.18a.75.75 0 0 1-1.09.79L8 12.33l-3.75 1.97a.75.75 0 0 1-1.09-.79l.72-4.18L.84 6.37a.75.75 0 0 1 .41-1.28l4.2-.61L7.33.67A.75.75 0 0 1 8 .25Z",
  repo: "M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.71 1.7.75.75 0 1 1-1.07 1.05A2.5 2.5 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.71c.3-.13.64-.21 1-.21h8Z",
};

export function statsCard(data) {
  const rows = [
    ["commit", "Commits no ano", data.commits],
    ["pull", "Pull requests", data.pullRequests],
    ["issue", "Issues", data.issues],
    ["star", "Estrelas recebidas", data.stars],
    ["repo", "Contribuiu em", data.contributedTo],
  ];

  const list = rows
    .map(([icon, label, value], index) => {
      const y = 70 + index * 26;
      return `<g transform="translate(24 ${y - 12})"><path d="${icons[icon]}" fill="${palette.soft}" transform="scale(0.95)"/></g>
<text x="48" y="${y}" fill="${palette.text}" font-size="14">${label}</text>
<text x="250" y="${y}" fill="${palette.bright}" font-size="14" font-weight="600" text-anchor="end">${value}</text>`;
    })
    .join("\n");

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(data.yearContributions / 500, 1);

  const ring = `<g transform="translate(345 112)">
<circle r="${radius}" fill="none" stroke="${palette.line}" stroke-width="7"/>
<circle r="${radius}" fill="none" stroke="${palette.accent}" stroke-width="7" stroke-linecap="round"
  stroke-dasharray="${(circumference * progress).toFixed(1)} ${circumference.toFixed(1)}" transform="rotate(-90)"/>
<text y="6" fill="${palette.bright}" font-size="24" font-weight="700" text-anchor="middle">${data.yearContributions}</text>
<text y="68" fill="${palette.muted}" font-size="12" text-anchor="middle">contribuições no ano</text>
</g>`;

  return frame(450, 200, `${title("Estatísticas no GitHub")}\n${list}\n${ring}`);
}

export function languagesCard(data) {
  const total = data.languages.reduce((sum, [, size]) => sum + size, 0) || 1;
  const top = data.languages.slice(0, 8);
  const barWidth = 402;

  let offset = 24;
  const segments = top
    .map(([, size], index) => {
      const width = (size / total) * barWidth;
      const piece = `<rect x="${offset.toFixed(2)}" y="54" width="${width.toFixed(2)}" height="8" fill="${langTones[index]}"/>`;
      offset += width;
      return piece;
    })
    .join("\n");

  const legend = top
    .map(([name, size], index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = 24 + column * 205;
      const y = 92 + row * 26;
      const percent = ((size / total) * 100).toFixed(1);
      return `<circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${langTones[index]}"/>
<text x="${x + 18}" y="${y}" fill="${palette.text}" font-size="13">${escape(name)} <tspan fill="${palette.muted}">${percent}%</tspan></text>`;
    })
    .join("\n");

  const bar = `<clipPath id="bar"><rect x="24" y="54" width="${barWidth}" height="8" rx="4"/></clipPath>
<rect x="24" y="54" width="${barWidth}" height="8" rx="4" fill="${palette.line}"/>
<g clip-path="url(#bar)">${segments}</g>`;

  return frame(450, 200, `${title("Linguagens mais usadas")}\n${bar}\n${legend}`);
}

export function activityCard(data) {
  const width = 900;
  const height = 300;
  const left = 56;
  const right = 28;
  const top = 64;
  const bottom = 48;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;

  const counts = data.lastDays.map((day) => day.contributionCount);
  const peak = Math.max(4, ...counts);
  const ceiling = Math.ceil(peak / 4) * 4;
  const step = chartWidth / Math.max(counts.length - 1, 1);

  const points = counts.map((count, index) => [
    left + index * step,
    top + chartHeight - (count / ceiling) * chartHeight,
  ]);

  const path = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const baseline = top + chartHeight;
  const area = `${path} L${points.at(-1)[0].toFixed(1)} ${baseline} L${left} ${baseline} Z`;

  const grid = [0, 1, 2, 3, 4]
    .map((mark) => {
      const y = top + chartHeight - (mark / 4) * chartHeight;
      return `<line x1="${left}" x2="${width - right}" y1="${y}" y2="${y}" stroke="${palette.line}"/>
<text x="${left - 12}" y="${y + 4}" fill="${palette.muted}" font-size="12" text-anchor="end">${(ceiling / 4) * mark}</text>`;
    })
    .join("\n");

  const labels = data.lastDays
    .map((day, index) => {
      if (index % 5 !== 0 && index !== data.lastDays.length - 1) return "";
      const [, month, date] = day.date.split("-");
      const anchor = index === data.lastDays.length - 1 ? "end" : index === 0 ? "start" : "middle";
      return `<text x="${points[index][0].toFixed(1)}" y="${height - 20}" fill="${palette.muted}" font-size="12" text-anchor="${anchor}">${date}/${month}</text>`;
    })
    .join("\n");

  const dots = points
    .map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="${palette.bg}" stroke="${palette.soft}" stroke-width="1.6"/>`)
    .join("\n");

  const gradient = `<linearGradient id="fade" x1="0" x2="0" y1="0" y2="1">
<stop offset="0" stop-color="${palette.accent}" stop-opacity="0.45"/>
<stop offset="1" stop-color="${palette.accent}" stop-opacity="0"/>
</linearGradient>`;

  const total = counts.reduce((sum, count) => sum + count, 0);
  const summary = `<text x="${width - right}" y="36" fill="${palette.muted}" font-size="13" text-anchor="end">${total} contribuições nos últimos 31 dias</text>`;

  return frame(
    width,
    height,
    `<defs>${gradient}</defs>
${title("Atividade recente")}
${summary}
${grid}
<path d="${area}" fill="url(#fade)"/>
<path d="${path}" fill="none" stroke="${palette.accent}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
${dots}
${labels}`,
  );
}

const ranks = ["C", "B", "A", "AA", "AAA", "S"];

function rankFor(value, thresholds) {
  let rank = -1;
  thresholds.forEach((limit, index) => {
    if (value >= limit) rank = index;
  });
  return rank;
}

const rankTones = ["#8A7B6E", "#B5521F", "#D9622B", "#F2A65A", "#FFB27A", "#FFE3C8"];

function cup(x, label, value, rank) {
  const tone = rank >= 0 ? rankTones[rank] : palette.line;
  const letter = rank >= 0 ? ranks[rank] : "?";

  return `<g transform="translate(${x} 0)">
<rect x="0" y="0" width="120" height="150" rx="10" fill="${palette.bg}" stroke="${palette.line}"/>
<g transform="translate(60 46)" fill="none" stroke="${tone}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
<path d="M-17 -22 H17 V-6 A17 17 0 0 1 -17 -6 Z" fill="${tone}" fill-opacity="0.18"/>
<path d="M-17 -16 H-25 V-10 A9 9 0 0 0 -16 -2"/>
<path d="M17 -16 H25 V-10 A9 9 0 0 1 16 -2"/>
<path d="M0 11 V20"/>
<path d="M-12 24 H12"/>
</g>
<text x="60" y="44" fill="${tone}" font-size="12" font-weight="700" text-anchor="middle">${letter}</text>
<text x="60" y="102" fill="${palette.text}" font-size="13" font-weight="600" text-anchor="middle">${label}</text>
<text x="60" y="124" fill="${palette.muted}" font-size="12" text-anchor="middle">${value}</text>
</g>`;
}

export function trophiesCard(data) {
  const trophies = [
    ["Commits", data.commits, [1, 50, 150, 400, 800, 1500]],
    ["Contribuições", data.yearContributions, [1, 50, 150, 400, 800, 1500]],
    ["Pull Requests", data.pullRequests, [1, 5, 20, 50, 100, 250]],
    ["Repositórios", data.repositories, [1, 5, 15, 30, 60, 100]],
    ["Estrelas", data.stars, [1, 5, 20, 50, 150, 500]],
    ["Seguidores", data.followers, [1, 5, 15, 40, 100, 300]],
  ];

  const body = trophies
    .map(([label, value, thresholds], index) => cup(index * 132, label, value, rankFor(value, thresholds)))
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="780" height="150" viewBox="0 0 780 150" font-family="${font}">
${body}
</svg>
`;
}

export async function writeCards(data, folder) {
  await mkdir(folder, { recursive: true });
  await Promise.all([
    writeFile(`${folder}/stats.svg`, statsCard(data)),
    writeFile(`${folder}/top-langs.svg`, languagesCard(data)),
    writeFile(`${folder}/activity.svg`, activityCard(data)),
    writeFile(`${folder}/trophies.svg`, trophiesCard(data)),
  ]);
}

async function main() {
  const login = process.env.GITHUB_USER;
  const token = process.env.GITHUB_TOKEN;

  if (!login || !token) {
    throw new Error("Defina GITHUB_USER e GITHUB_TOKEN para gerar os cards.");
  }

  const user = await fetchProfile(login, token);
  await writeCards(summarize(user), process.env.OUTPUT_DIR ?? "dist");
  console.log(`Cards gerados para ${login}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

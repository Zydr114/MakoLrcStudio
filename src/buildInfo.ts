// Build-time Git metadata injected by vite.config.ts. The typeof guards keep
// this module usable in environments that do not run the production config.
declare const __GIT_COMMIT__: string;
declare const __GIT_BRANCH__: string;
declare const __GIT_DATE__: string;
declare const __GIT_DIRTY__: boolean;

const injected = (value: string | undefined, fallback: string) =>
  value?.trim() || fallback;

const commit = injected(
  typeof __GIT_COMMIT__ === "undefined" ? undefined : __GIT_COMMIT__,
  "未知",
);
const branch = injected(
  typeof __GIT_BRANCH__ === "undefined" ? undefined : __GIT_BRANCH__,
  "未知",
);
const date = injected(
  typeof __GIT_DATE__ === "undefined" ? undefined : __GIT_DATE__,
  "",
);
const dirty = typeof __GIT_DIRTY__ !== "undefined" && __GIT_DIRTY__ === true;

function formatDate(value: string): string {
  if (!value) return "未知";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

export const gitInfo = {
  commit,
  branch,
  date,
  dateLabel: formatDate(date),
  dirty,
  known: commit !== "未知",
};

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const root = fileURLToPath(new URL(".", import.meta.url));
function git(...args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}
const commit = git("rev-parse", "--short=7", "HEAD");
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
const date = git("show", "-s", "--format=%cI", "HEAD");
const dirty = git("status", "--porcelain", "--untracked-files=no") !== "";

export default defineConfig({
  base: "./",
  define: {
    __GIT_COMMIT__: JSON.stringify(commit),
    __GIT_BRANCH__: JSON.stringify(branch),
    __GIT_DATE__: JSON.stringify(date),
    __GIT_DIRTY__: JSON.stringify(dirty),
  },
  plugins: [
    vue({
      template: {
        compilerOptions: { isCustomElement: (tag) => tag.startsWith("mdui-") },
      },
    }),
  ],
});

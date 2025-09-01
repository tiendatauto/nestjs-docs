// Central constant to describe the documentation folder & file structure (recursive)
// Only raw names are stored. Display names will be derived (simply from the name) in the hook.

export interface DocsFolderNode {
  name: string; // folder slug (matches directory name)
  icon?: string; // optional icon string (emoji)
  folders?: DocsFolderNode[]; // nested sub-folders
  files?: string[]; // markdown file base names (without .md) inside this folder
}

export interface DocsTree {
  rootFiles: string[]; // markdown files directly under /public/docs (without .md)
  folders: DocsFolderNode[]; // top-level folders
}

export const docsTree: DocsTree = {
  rootFiles: [],
  folders: [
    {
      name: "advanced",
      icon: "🚀",
      files: [
        "cache-redis",
        "cronjob",
        "database-design-thinking",
        "database-indexing",
        "file-upload",
        "helmet",
        "lock-comparison",
        "logger",
        "logger-pino",
        "optimistic-lock",
        "pagination-filter-sort-search",
        "pessimistic-lock",
        "prisma-orm",
        "queue-bullmq",
        "race-condition",
        "rate-limit",
        "redis",
        "redlock",
        "swagger",
        "websocket",
      ],
    },
    {
      name: "authentication",
      icon: "🔐",
      files: ["README"],
    },
    {
      name: "core",
      icon: "⚙️",
      files: [
        "decorator",
        "dependency-injection",
        "exception-filter",
        "guard",
        "interceptor",
        "middleware",
        "pipe",
      ],
    },
    {
      name: "init",
      icon: "🚀",
      folders: [
        { name: "create-docker", files: ["README"] },
        { name: "env-config", files: ["README"] },
        {
          name: "initial",
          files: [
            "README",
            "setup-authentication",
            "setup-env-config",
            "setup-eslint-prettier",
            "setup-prisma",
            "setup-testing",
            "TEAM_CHECKLIST",
          ],
        },
        { name: "setup-eslint-prettier", files: ["README"] },
        {
          name: "setup-prisma",
          files: ["prisma-cli", "prisma-migrate", "README"],
        },
      ],
    },
  ],
};

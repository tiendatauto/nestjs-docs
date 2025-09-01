import { useState, useEffect } from "react";
import type { MarkdownFile } from "../types";

export const useMarkdownFiles = () => {
  const [files, setFiles] = useState<MarkdownFile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Simulate loading time for better UX
    const timer = setTimeout(() => {
      const markdownFiles: MarkdownFile[] = [
        {
          name: "react-introduction",
          displayName: "📘 React Introduction",
          path: "/docs/react-introduction.md",
        },
        {
          name: "typescript-react",
          displayName: "🔷 TypeScript + React",
          path: "/docs/typescript-react.md",
        },
        {
          name: "tailwindcss-guide",
          displayName: "🎨 TailwindCSS Guide",
          path: "/docs/tailwindcss-guide.md",
        },
        {
          name: "vite-guide",
          displayName: "⚡ Vite Build Tool",
          path: "/docs/vite-guide.md",
        },
      ];

      setFiles(markdownFiles);
      setLoading(false);
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  return { files, loading };
};

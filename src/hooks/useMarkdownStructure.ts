import { useState, useEffect } from "react";
import type { MarkdownStructure, MarkdownFolder, MarkdownFile } from "../types";
import { docsTree } from "../constants/docsStructure";

export const useMarkdownStructure = () => {
  const [structure, setStructure] = useState<MarkdownStructure>({
    rootFiles: [],
    folders: [],
  });
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      const toDisplayName = (slug: string) => {
        // Convert slug to Title Case (basic) keeping capitals like README
        if (slug === slug.toUpperCase()) return slug; // e.g. README
        return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      };

      const buildFiles = (
        fileNames: string[],
        folderPath?: string
      ): MarkdownFile[] => {
        return fileNames.map((name) => ({
          name,
          // DisplayName derived from slug (no icons here; icons stay on folders)
          displayName: toDisplayName(name),
          path: folderPath
            ? `/docs/${folderPath}/${name}.md`
            : `/docs/${name}.md`,
          folder: folderPath,
        }));
      };

      const buildFolder = (node: any, parentPath?: string): MarkdownFolder => {
        const currentPath = parentPath
          ? `${parentPath}/${node.name}`
          : node.name;
        const files = buildFiles(node.files || [], currentPath);
        const folders = (node.folders || []).map((child: any) =>
          buildFolder(child, currentPath)
        );
        return {
          name: node.name,
          displayName: `${node.icon ? node.icon + " " : ""}${toDisplayName(
            node.name
          )}`,
          icon: node.icon,
          files,
          folders,
          parentPath,
          fullPath: currentPath,
        };
      };

      const rootFiles: MarkdownFile[] = buildFiles(docsTree.rootFiles);
      const folders: MarkdownFolder[] = docsTree.folders.map((f) =>
        buildFolder(f)
      );

      setStructure({ rootFiles, folders });
      setLoading(false);
    }, 400);

    return () => clearTimeout(timer);
  }, []);

  return { structure, loading };
};

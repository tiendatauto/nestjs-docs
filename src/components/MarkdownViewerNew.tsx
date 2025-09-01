import React, { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import {
  Paper,
  Text,
  Loader,
  Alert,
  Stack,
  Breadcrumbs,
  Anchor,
  Card,
  Divider,
  ScrollArea,
  Box,
  Group,
} from "@mantine/core";
import { IconAlertCircle, IconHome, IconFolder } from "@tabler/icons-react";

interface MarkdownViewerNewProps {
  fileName?: string;
  folderName?: string;
}

const welcomeMarkdown = `# 🎉 Chào mừng bạn đến với React Study!\n\nChọn một tài liệu từ sidebar để bắt đầu.\n\n## Ví dụ\n- React Introduction\n- TypeScript React\n\n---`;

const MarkdownViewerNew: React.FC<MarkdownViewerNewProps> = ({
  fileName,
  folderName,
}) => {
  const location = useLocation();

  // Parse the current path to extract file and folder information
  const { currentFile, pathParts } = useMemo(() => {
    // If props are provided, use them directly
    if (fileName || folderName) {
      return {
        currentFile: fileName,
        pathParts: folderName ? [folderName] : [],
      };
    }

    // Parse from URL path
    const pathSegments = location.pathname.split("/").filter(Boolean);

    if (pathSegments.length === 0) {
      return { currentFile: undefined, pathParts: [] };
    } else if (pathSegments.length > 1 && pathSegments[0] === "docs") {
      // Extract file name (last segment) and folder path (middle segments)
      const file = pathSegments[pathSegments.length - 1];
      const parts = pathSegments.slice(1, -1); // Remove 'docs' and filename
      return { currentFile: file, pathParts: parts };
    }

    return { currentFile: undefined, pathParts: [] };
  }, [location.pathname, fileName, folderName]);

  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [headings, setHeadings] = useState<
    { level: number; text: string; id: string }[]
  >([]);

  useEffect(() => {
    if (!currentFile) {
      setContent(welcomeMarkdown);
      setLoading(false);
      setError("");
      return;
    }
    (async () => {
      try {
        setLoading(true);
        setError("");

        // Construct URL based on the path parts
        let url: string;
        if (pathParts.length > 0) {
          // Multiple levels: docs/folder/subfolder/.../file.md
          url = `/docs/${pathParts.join("/")}/${currentFile}.md`;
        } else {
          // One level: docs/file.md
          url = `/docs/${currentFile}.md`;
        }

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Không thể tải file: ${res.status}`);
        setContent(await res.text());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lỗi tải file");
        setContent("");
      } finally {
        setLoading(false);
      }
    })();
  }, [pathParts, currentFile]);

  useEffect(() => {
    if (!content) {
      setHeadings([]);
      return;
    }
    const counts: Record<string, number> = {};
    const slugify = (s: string) => {
      const base = s
        .toLowerCase()
        .trim()
        .replace(/[`*_~]/g, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-");
      const c = counts[base] || 0;
      counts[base] = c + 1;
      return c === 0 ? base : `${base}-${c}`;
    };
    const list: { level: number; text: string; id: string }[] = [];
    const re = /^(#{1,4})\s+(.+)$/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const lvl = m[1].length;
      const raw = m[2].trim();
      const txt = raw.replace(/#+$/, "").trim();
      list.push({ level: lvl, text: txt, id: slugify(txt) });
    }
    setHeadings(list);
  }, [content]);

  // Create an assigner so rendered heading ids exactly match extracted list (handles duplicates)
  const createHeadingIdAssigner = (items: { text: string; id: string }[]) => {
    const idBuckets: Record<string, string[]> = {};
    items.forEach((h) => {
      (idBuckets[h.text] ||= []).push(h.id);
    });
    const usage: Record<string, number> = {};
    return (text: string) => {
      const idx = usage[text] || 0;
      usage[text] = idx + 1;
      const bucket = idBuckets[text];
      return bucket ? bucket[idx] : text;
    };
  };

  const assignHeadingId = useMemo(
    () => createHeadingIdAssigner(headings),
    [headings]
  );

  const getNodeText = (node: React.ReactNode): string => {
    if (node == null) return "";
    if (typeof node === "string" || typeof node === "number")
      return String(node);
    if (Array.isArray(node)) return node.map(getNodeText).join("");
    if (React.isValidElement(node))
      return getNodeText((node as any).props?.children);
    return "";
  };

  const components = useMemo(
    () => ({
      h1: (p: any) => {
        const text = getNodeText(p.children);
        const id = assignHeadingId(text);
        return <h1 id={id} style={{ scrollMarginTop: 80 }} {...p} />;
      },
      h2: (p: any) => {
        const text = getNodeText(p.children);
        const id = assignHeadingId(text);
        return <h2 id={id} style={{ scrollMarginTop: 80 }} {...p} />;
      },
      h3: (p: any) => {
        const text = getNodeText(p.children);
        const id = assignHeadingId(text);
        return <h3 id={id} style={{ scrollMarginTop: 80 }} {...p} />;
      },
      h4: (p: any) => {
        const text = getNodeText(p.children);
        const id = assignHeadingId(text);
        return <h4 id={id} style={{ scrollMarginTop: 80 }} {...p} />;
      },
    }),
    [assignHeadingId]
  );

  // Smooth scroll when clicking TOC (will add handler below)
  const handleTocClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 72;
      window.scrollTo({ top, behavior: "smooth" });
      history.replaceState(null, "", `#${id}`);
    }
  };

  // Scroll to hash on first render after content loads
  useEffect(() => {
    if (!content) return;
    const hash = decodeURIComponent(window.location.hash.replace("#", ""));
    if (hash) {
      requestAnimationFrame(() => {
        const el = document.getElementById(hash);
        if (el) {
          const top = el.getBoundingClientRect().top + window.scrollY - 72;
          window.scrollTo({ top });
        }
      });
    }
  }, [content]);

  // Memoize breadcrumbs before any early returns to avoid hooks order issues
  const breadcrumbs = useMemo(() => {
    const crumbs = [
      <Anchor key="home" href="/" size="sm">
        <IconHome size={14} style={{ marginRight: 4 }} />
        Trang chủ
      </Anchor>,
    ];

    // Add folder breadcrumbs
    pathParts.forEach((part, index) => {
      crumbs.push(
        <Text key={`path-${index}`} size="sm" c="dimmed">
          <IconFolder size={14} style={{ marginRight: 4 }} />
          {part}
        </Text>
      );
    });

    // Add file breadcrumb
    if (currentFile) {
      crumbs.push(
        <Text key="file" size="sm">
          {currentFile}
        </Text>
      );
    }

    return crumbs;
  }, [pathParts, currentFile]);

  if (loading)
    return (
      <Stack
        align="center"
        gap="md"
        style={{ minHeight: 200, justifyContent: "center" }}
      >
        <Loader color="blue" />
        <Text c="dimmed">Đang tải nội dung...</Text>
      </Stack>
    );
  if (error)
    return (
      <Alert
        icon={<IconAlertCircle size={16} />}
        color="red"
        title="Lỗi tải file"
        variant="light"
      >
        {error}
      </Alert>
    );

  return (
    <div style={{ width: "100%" }}>
      {(currentFile || pathParts.length > 0) && (
        <Breadcrumbs mb="md">{breadcrumbs}</Breadcrumbs>
      )}
      <Group
        align="flex-start"
        gap="lg"
        wrap="nowrap"
        style={{ width: "100%" }}
      >
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Paper shadow="sm" p="xl" radius="md" withBorder>
            <Box className="prose max-w-none">
              <ReactMarkdown
                rehypePlugins={[rehypeHighlight]}
                components={components}
              >
                {content}
              </ReactMarkdown>
            </Box>
          </Paper>
        </Box>
        {headings.length > 0 && (
          <Box
            style={{
              width: 260,
              position: "sticky",
              top: 12,
              alignSelf: "flex-start",
              maxHeight: "calc(100vh - 100px)",
            }}
            visibleFrom="md"
          >
            <Card withBorder padding="md" radius="md" shadow="xs">
              <Text fw={600} mb={4} size="sm" c="blue">
                Mục lục
              </Text>
              <Divider mb="sm" />
              <ScrollArea h="calc(100vh - 180px)" offsetScrollbars>
                <Stack gap={4}>
                  {headings.map((h) => (
                    <Anchor
                      key={h.id}
                      href={`#${h.id}`}
                      size="sm"
                      onClick={(e: React.MouseEvent<HTMLAnchorElement>) =>
                        handleTocClick(e, h.id)
                      }
                      style={{
                        marginLeft: (h.level - 1) * 12,
                        fontWeight: h.level <= 2 ? 500 : 400,
                        lineHeight: 1.3,
                        cursor: "pointer",
                      }}
                    >
                      {h.text}
                    </Anchor>
                  ))}
                </Stack>
              </ScrollArea>
            </Card>
          </Box>
        )}
      </Group>
    </div>
  );
};

export default MarkdownViewerNew;

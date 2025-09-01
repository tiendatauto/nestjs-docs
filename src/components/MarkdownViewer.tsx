import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
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
} from "@mantine/core";
import { IconAlertCircle, IconHome } from "@tabler/icons-react";

interface MarkdownViewerProps {
  fileName?: string;
}

const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ fileName }) => {
  const { filename } = useParams<{ filename: string }>();
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const fileToLoad = fileName || filename;

  useEffect(() => {
    const loadMarkdown = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(`/docs/${fileToLoad}.md`);

        if (!response.ok) {
          throw new Error(`Không thể tải file: ${response.status}`);
        }

        const text = await response.text();
        setContent(text);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Đã xảy ra lỗi khi tải file"
        );
        setContent("");
      } finally {
        setLoading(false);
      }
    };

    loadMarkdown();
  }, [fileToLoad]);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "200px",
        }}
      >
        <Stack align="center" gap="md">
          <Loader color="blue" size="lg" />
          <Text size="lg" c="dimmed">
            Đang tải nội dung...
          </Text>
        </Stack>
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        icon={<IconAlertCircle size={16} />}
        title="Lỗi tải file"
        color="red"
        variant="light"
      >
        {error}
      </Alert>
    );
  }

  return (
    <div style={{ width: "100%" }}>
      {fileToLoad && (
        <Breadcrumbs mb="md">
          <Anchor href="/" size="sm">
            <IconHome size={14} style={{ marginRight: 4 }} />
            Trang chủ
          </Anchor>
          <Text size="sm">{fileToLoad}</Text>
        </Breadcrumbs>
      )}

      <Paper shadow="sm" p="xl" radius="md" withBorder>
        <div className="prose">
          <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
            {content}
          </ReactMarkdown>
        </div>
      </Paper>
    </div>
  );
};

export default MarkdownViewer;

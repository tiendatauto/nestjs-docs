import React from "react";
import { Link, useLocation } from "react-router-dom";
import { NavLink, Stack, Text, Badge, Loader, Alert, Box } from "@mantine/core";
import { IconFileText, IconBook2 } from "@tabler/icons-react";
import { useMarkdownFiles } from "../hooks/useMarkdownFiles";

const Sidebar: React.FC = () => {
  const { files, loading } = useMarkdownFiles();
  const location = useLocation();

  if (loading) {
    return (
      <Box
        h="100%"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Stack align="center" gap="md">
          <Loader color="blue" size="sm" />
          <Text size="sm" c="dimmed">
            Đang tải tài liệu...
          </Text>
        </Stack>
      </Box>
    );
  }

  return (
    <Stack gap="md" h="100%" style={{ minHeight: "400px" }}>
      <Box>
        <Text size="lg" fw={600} mb="md" c="blue">
          📚 Tài liệu học tập
        </Text>
        <Badge color="blue" variant="light" size="sm" mb="md">
          {files.length} tài liệu
        </Badge>
      </Box>

      <Stack gap="xs" style={{ flex: 1 }}>
        {files.map((file) => {
          const isActive = location.pathname === `/docs/${file.name}`;
          return (
            <NavLink
              key={file.name}
              component={Link}
              to={`/docs/${file.name}`}
              label={file.displayName}
              leftSection={<IconFileText size={16} />}
              active={isActive}
              variant="subtle"
              styles={{
                root: {
                  borderRadius: "8px",
                  fontSize: "14px",
                  padding: "12px 16px",
                  transition: "all 0.2s ease",
                },
                label: {
                  fontWeight: isActive ? 600 : 400,
                },
              }}
            />
          );
        })}
      </Stack>

      <Alert
        icon={<IconBook2 size={16} />}
        title="💡 Tip"
        color="blue"
        variant="light"
      >
        <Text size="sm">
          Mỗi tài liệu chứa kiến thức cơ bản và ví dụ thực tế. Hãy thực hành
          theo để học hiệu quả nhất!
        </Text>
      </Alert>
    </Stack>
  );
};

export default Sidebar;

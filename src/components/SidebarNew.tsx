import React, { useState, Fragment } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  NavLink,
  Stack,
  Text,
  Badge,
  Loader,
  Alert,
  Box,
  Collapse,
  Group,
  ActionIcon,
} from "@mantine/core";
import {
  IconFileText,
  IconBook2,
  IconChevronDown,
  IconChevronRight,
  IconFolder,
} from "@tabler/icons-react";
import { useMarkdownStructure } from "../hooks/useMarkdownStructure";
import type { MarkdownFolder, MarkdownFile } from "../types";

const SidebarNew: React.FC = () => {
  const { structure, loading } = useMarkdownStructure();
  const location = useLocation();
  const [openedFolders, setOpenedFolders] = useState<Set<string>>(new Set());

  const toggleFolder = (fullPath: string) => {
    setOpenedFolders((prev) => {
      const next = new Set(prev);
      next.has(fullPath) ? next.delete(fullPath) : next.add(fullPath);
      return next;
    });
  };

  const countFilesRecursive = (folders: MarkdownFolder[]): number =>
    folders.reduce(
      (acc, f) =>
        acc + f.files.length + (f.folders ? countFilesRecursive(f.folders) : 0),
      0
    );
  const totalFiles =
    structure.rootFiles.length + countFilesRecursive(structure.folders);

  const buildFileLink = (file: MarkdownFile): string => {
    if (file.folder) return `/docs/${file.folder}/${file.name}`;
    return `/docs/${file.name}`;
  };

  const renderFiles = (files: MarkdownFile[], depth: number) => (
    <Stack gap={2} ml={depth > 0 ? "md" : 0} mt={depth > 0 ? "xs" : 0}>
      {files.map((file) => {
        const to = buildFileLink(file);
        const isActive = location.pathname === to;
        return (
          <NavLink
            key={to}
            component={Link}
            to={to}
            label={file.displayName}
            leftSection={<IconFileText size={14} />}
            active={isActive}
            variant="subtle"
            styles={{
              root: {
                borderRadius: "6px",
                fontSize: "13px",
                padding: "8px 12px",
                transition: "all 0.2s ease",
                borderLeft: "2px solid transparent",
                borderLeftColor: isActive
                  ? "var(--mantine-color-blue-6)"
                  : "transparent",
              },
              label: { fontWeight: isActive ? 600 : 400 },
            }}
          />
        );
      })}
    </Stack>
  );

  const renderFolderRecursive = (folder: MarkdownFolder, depth: number) => {
    const fullPath = folder.fullPath || folder.name;
    const isOpened = openedFolders.has(fullPath);
    const fileCount =
      folder.files.length +
      (folder.folders ? countFilesRecursive(folder.folders) : 0);

    return (
      <Box key={fullPath} mt={depth > 0 ? 4 : 0}>
        <NavLink
          label={
            <Group gap="xs" justify="space-between" style={{ flex: 1 }}>
              <Text size="sm" fw={500}>
                {folder.displayName}
              </Text>
              <Badge size="xs" variant="light" color="gray">
                {fileCount}
              </Badge>
            </Group>
          }
          leftSection={<IconFolder size={16} />}
          rightSection={
            <ActionIcon
              size="sm"
              variant="transparent"
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                toggleFolder(fullPath);
              }}
            >
              {isOpened ? (
                <IconChevronDown size={14} />
              ) : (
                <IconChevronRight size={14} />
              )}
            </ActionIcon>
          }
          onClick={() => toggleFolder(fullPath)}
          variant="subtle"
          styles={{
            root: {
              borderRadius: "8px",
              fontSize: "14px",
              padding: "10px 14px",
              transition: "all 0.2s ease",
              backgroundColor: isOpened
                ? "var(--mantine-color-blue-0)"
                : "transparent",
              marginLeft: depth * 8,
            },
            label: { fontWeight: 500, width: "100%" },
          }}
        />
        <Collapse in={isOpened}>
          {renderFiles(folder.files, depth + 1)}
          {folder.folders && folder.folders.length > 0 && (
            <Stack gap={2} ml="md" mt="xs">
              {folder.folders.map((sub) => (
                <Fragment key={sub.fullPath || sub.name}>
                  {renderFolderRecursive(sub, depth + 1)}
                </Fragment>
              ))}
            </Stack>
          )}
        </Collapse>
      </Box>
    );
  };

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
          {totalFiles} tài liệu
        </Badge>
      </Box>

      <Stack gap="xs" style={{ flex: 1 }}>
        {structure.rootFiles.map((file) => {
          const to = `/docs/${file.name}`;
          const isActive = location.pathname === to;
          return (
            <NavLink
              key={to}
              component={Link}
              to={to}
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
                label: { fontWeight: isActive ? 600 : 400 },
              }}
            />
          );
        })}

        {structure.folders.map((folder) => (
          <Fragment key={folder.fullPath || folder.name}>
            {renderFolderRecursive(folder, 0)}
          </Fragment>
        ))}
      </Stack>

      <Alert
        icon={<IconBook2 size={16} />}
        title="💡 Tip"
        color="blue"
        variant="light"
      >
        <Text size="sm">
          Menu hỗ trợ mở rộng đệ quy nhiều cấp. Thêm thư mục & file trong
          constants để hiển thị tự động.
        </Text>
      </Alert>
    </Stack>
  );
};

export default SidebarNew;

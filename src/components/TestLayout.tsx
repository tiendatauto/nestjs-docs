import React from "react";
import { AppShell, Button, Group, Text, Box } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";

const TestLayout: React.FC = () => {
  const [opened, { toggle }] = useDisclosure(false);

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 300,
        breakpoint: "sm",
        collapsed: { mobile: !opened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md">
          <Button onClick={toggle} size="sm">
            Toggle Sidebar
          </Button>
          <Text>Header Content</Text>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md" style={{ backgroundColor: "#f0f0f0" }}>
        <Box>
          <Text size="lg" fw={600} mb="md">
            Test Sidebar
          </Text>
          <Text>This is a test sidebar</Text>
          <Text>Should be visible</Text>
          <Text>On desktop always</Text>
        </Box>
      </AppShell.Navbar>

      <AppShell.Main>
        <Box>
          <Text size="xl" fw={600}>
            Main Content
          </Text>
          <Text>Sidebar opened: {opened ? "Yes" : "No"}</Text>
        </Box>
      </AppShell.Main>
    </AppShell>
  );
};

export default TestLayout;

import React from "react";
import { Outlet } from "react-router-dom";
import { AppShell, Burger, Group, Title, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconBrandReact } from "@tabler/icons-react";
import SidebarNew from "./SidebarNew";

const AppLayout: React.FC = () => {
  const [opened, { toggle }] = useDisclosure(false);

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 300,
        breakpoint: "sm",
        collapsed: { mobile: !opened },
      }}
      padding={0}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
            />
            <Group gap="sm">
              <IconBrandReact size={28} color="#61DAFB" />
              <div>
                <Title order={3} size="h4" c="dark">
                  React Study
                </Title>
                <Text size="xs" c="dimmed">
                  Learning Documentation
                </Text>
              </div>
            </Group>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <SidebarNew />
      </AppShell.Navbar>

      <AppShell.Main>
        <div
          style={{
            padding: "1.5rem",
            backgroundColor: "#f8f9fa",
            minHeight: "calc(100vh - 60px)",
            width: "100%",
          }}
        >
          <Outlet />
        </div>
      </AppShell.Main>
    </AppShell>
  );
};

export default AppLayout;

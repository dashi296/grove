import "../global.css";

import { Stack } from "expo-router";

import { AppProviders } from "../app.providers/AppProviders";

export default function RootLayout() {
  return (
    <AppProviders>
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: "#EAF3DE",
          },
          headerTintColor: "#27500A",
          contentStyle: {
            backgroundColor: "#F5F1E8",
          },
        }}
      />
    </AppProviders>
  );
}

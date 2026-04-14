import { Text, View } from "react-native";

export function WorkspaceSelectScreen() {
  return (
    <View className="flex-1 bg-[#F5F1E8] px-6 py-10">
      <Text className="text-3xl font-semibold text-[#27500A]">Select a workspace</Text>
      <Text className="mt-4 text-base leading-6 text-[#27500A]">
        The native workspace picker will land in a follow-up slice. This screen proves the router and folder structure
        are wired.
      </Text>
    </View>
  );
}

// Expo Router のファイルベースルーティングはデフォルトエクスポートを必要とするため再エクスポート
export default WorkspaceSelectScreen;

import { Link } from "expo-router";
import { Text, View } from "react-native";

import { appName } from "@grove/core";

export function IndexScreen() {
  return (
    <View className="flex-1 justify-center bg-[#F5F1E8] px-6">
      <View className="rounded-[28px] bg-[#EAF3DE] p-6">
        <Text className="text-xs uppercase tracking-[2px] text-[#639922]">Mobile Shell</Text>
        <Text className="mt-3 text-4xl font-semibold text-[#27500A]">{appName}</Text>
        <Text className="mt-4 text-base leading-6 text-[#27500A]">
          Expo Bare, Expo Router, and NativeWind are connected so the mobile note flows can land
          without revisiting the workspace setup.
        </Text>
        <Link className="mt-6 text-base font-medium text-[#639922]" href="/workspace/select">
          Open workspace setup
        </Link>
      </View>
    </View>
  );
}

// Expo Router のファイルベースルーティングはデフォルトエクスポートを必要とするため再エクスポート
export default IndexScreen;

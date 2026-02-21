import { router } from "expo-router";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
export default function HomeScreen() {
  return (
    <TouchableOpacity
      onPress={() => router.push("/waiter")} // Use "/waiter/WaiterApp" if you didn't rename it
      style={{ padding: 20, backgroundColor: "#F97316", borderRadius: 10 }}
    >
      <Text style={{ color: "white", fontWeight: "bold" }}>Staff Login</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
  },
  subtitle: {
    fontSize: 16,
    marginTop: 10,
    color: "#666",
  },
});

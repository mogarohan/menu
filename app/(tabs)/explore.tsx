import { FlatList, StyleSheet, Text, View } from "react-native";

const categories = [
  { id: 1, name: "Thali" },
  { id: 2, name: "Fast Food" },
  { id: 3, name: "South Indian" },
  { id: 4, name: "Chinese" },
  { id: 5, name: "Beverages" },
];

export default function ExploreScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🔍 Explore Categories</Text>

      <FlatList
        data={categories}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardText}>{item.name}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 12,
  },
  card: {
    padding: 20,
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    marginBottom: 10,
  },
  cardText: {
    fontSize: 18,
  },
});

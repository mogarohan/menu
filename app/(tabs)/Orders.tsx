// app/(tabs)/Orders.tsx
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

export default function Orders() {
  const { order } = useLocalSearchParams();
  const data = JSON.parse(order as string);

  const [status, setStatus] = useState("Preparing");

  useEffect(() => {
    setTimeout(() => setStatus("Ready"), 5000);
    setTimeout(() => setStatus("Served"), 10000);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Order</Text>

      {data.items.map((i: any) => (
        <Text key={i.id} style={styles.item}>
          {i.qty} × {i.name} — ₹ {i.qty * i.price}
        </Text>
      ))}

      <Text style={styles.total}>Total: ₹ {data.totalAmount}</Text>
      <Text style={styles.status}>Status: {status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 10 },
  item: { fontSize: 16, marginVertical: 4 },
  total: { marginTop: 10, fontSize: 18, fontWeight: "700" },
  status: { marginTop: 20, color: "#16a34a", fontWeight: "700" },
});

import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Text, View } from "react-native";

const BASE_URL = "http://192.168.1.5:8000/api";

export default function Bill() {
  const { sessionToken } = useLocalSearchParams();
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    const res = await fetch(`${BASE_URL}/orders/session/${sessionToken}`);
    const data = await res.json();
    setOrders(data);
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 22, fontWeight: "bold" }}>Your Orders</Text>

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={{ marginVertical: 10 }}>
            <Text>Order #{item.id}</Text>
            <Text>Status: {item.status}</Text>
            <Text>Total: ₹ {item.total_amount}</Text>
          </View>
        )}
      />
    </View>
  );
}

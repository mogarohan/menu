import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const API_URL = "http://192.168.1.5:8000/api/menu-items";

export default function Menu() {
  const router = useRouter();
  const [menu, setMenu] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<number, number>>({});

  useEffect(() => {
    fetch(API_URL)
      .then((res) => res.json())
      .then(setMenu)
      .finally(() => setLoading(false));
  }, []);

  const addItem = (id: number) =>
    setCart((p) => ({ ...p, [id]: (p[id] || 0) + 1 }));

  const removeItem = (id: number) =>
    setCart((p) => {
      const q = (p[id] || 0) - 1;
      if (q <= 0) {
        const c = { ...p };
        delete c[id];
        return c;
      }
      return { ...p, [id]: q };
    });

  const orderData = useMemo(() => {
    let totalQty = 0;
    let totalAmount = 0;
    const items: any[] = [];

    Object.keys(menu).forEach((cat) => {
      menu[cat].forEach((item: any) => {
        const q = cart[item.id];
        if (q > 0) {
          totalQty += q;
          totalAmount += q * Number(item.price);
          items.push({ ...item, qty: q });
        }
      });
    });

    return { items, totalQty, totalAmount };
  }, [cart, menu]);

  if (loading) {
    return <ActivityIndicator size="large" style={{ marginTop: 50 }} />;
  }

  return (
    <>
      <FlatList
        contentContainerStyle={{ paddingBottom: 120 }}
        data={Object.keys(menu)}
        keyExtractor={(item) => item}
        renderItem={({ item: category }) => (
          <View style={styles.categoryBox}>
            <Text style={styles.categoryTitle}>{category.toUpperCase()}</Text>

            {menu[category].map((item: any) => {
              const quantity = cart[item.id] || 0;

              return (
                <View key={item.id} style={styles.card}>
                  <Image
                    source={{ uri: item.image_url }}
                    style={styles.image}
                    resizeMode="cover"
                  />

                  <View style={styles.detailBox}>
                    <Text style={styles.name}>{item.name}</Text>

                    {!!item.description && (
                      <Text style={styles.desc}>{item.description}</Text>
                    )}

                    <View style={styles.bottomRow}>
                      <Text style={styles.price}>₹ {item.price}</Text>

                      {quantity === 0 ? (
                        <TouchableOpacity
                          style={styles.addBtn}
                          onPress={() => addItem(item.id)}
                        >
                          <Text style={styles.addText}>ADD</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.qtyBox}>
                          <TouchableOpacity
                            style={styles.qtyBtn}
                            onPress={() => removeItem(item.id)}
                          >
                            <Text style={styles.qtyText}>−</Text>
                          </TouchableOpacity>

                          <Text style={styles.qtyNumber}>{quantity}</Text>

                          <TouchableOpacity
                            style={styles.qtyBtn}
                            onPress={() => addItem(item.id)}
                          >
                            <Text style={styles.qtyText}>+</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      />

      {orderData.totalQty > 0 && (
        <View style={styles.cartBar}>
          <View>
            <Text style={styles.cartQty}>{orderData.totalQty} Items</Text>
            <Text style={styles.cartAmount}>₹ {orderData.totalAmount}</Text>
          </View>

          <TouchableOpacity
            style={styles.orderBtn}
            onPress={() => {
              setCart({});
              router.replace({
                pathname: "/Orders",
                params: { order: JSON.stringify(orderData) },
              });
            }}
          >
            <Text style={styles.orderText}>PLACE ORDER</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  categoryBox: { paddingHorizontal: 16, paddingTop: 16 },
  categoryTitle: { fontSize: 20, fontWeight: "700", marginBottom: 10 },

  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 3,
  },
  image: { width: 80, height: 80, borderRadius: 10, marginRight: 12 },

  detailBox: { flex: 1 },
  name: { fontSize: 16, fontWeight: "600" },
  desc: { fontSize: 13, color: "#666", marginVertical: 4 },

  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  price: { fontSize: 15, fontWeight: "bold", color: "#16a34a" },

  addBtn: {
    backgroundColor: "#16a34a",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addText: { color: "#fff", fontWeight: "700" },

  qtyBox: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#16a34a",
    borderRadius: 6,
  },
  qtyBtn: {
    backgroundColor: "#16a34a",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  qtyText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  qtyNumber: {
    paddingHorizontal: 12,
    fontWeight: "700",
    color: "#16a34a",
  },

  cartBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#16a34a",
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cartQty: { color: "#fff", fontWeight: "700" },
  cartAmount: { color: "#fff", fontWeight: "800" },
  orderBtn: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 6,
  },
  orderText: { color: "#16a34a", fontWeight: "800" },
});

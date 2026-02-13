import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

const BASE_URL = "http://127.0.0.1:8000/api"; // ⚠️ CHANGE TO YOUR PC IP

export default function Menu() {
  const router = useRouter();
  const { restaurantId, tableId, qrToken } = useLocalSearchParams();

  const [menu, setMenu] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!restaurantId || !tableId || !qrToken) return;

    const init = async () => {
      try {
        // 1️⃣ Validate QR
        const validateRes = await fetch(
          `${BASE_URL}/qr/validate/${restaurantId}/${tableId}/${qrToken}`,
        );

        if (!validateRes.ok) throw new Error("Invalid QR Code");

        // 2️⃣ Start Session
        const sessionRes = await fetch(
          `${BASE_URL}/qr/session/start/${restaurantId}/${tableId}/${qrToken}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ customer_name: null }),
          },
        );

        const sessionData = await sessionRes.json();
        if (!sessionRes.ok) throw new Error("Session creation failed");

        setSessionToken(sessionData.session_token);

        // 3️⃣ Fetch Menu with session_token
        const menuRes = await fetch(
          `${BASE_URL}/menu/${restaurantId}/${tableId}/${qrToken}?session_token=${sessionData.session_token}`,
        );

        const menuData = await menuRes.json();
        if (!menuRes.ok)
          throw new Error(menuData.message || "Menu load failed");

        setMenu(menuData);
      } catch (err: any) {
        Alert.alert("Error", err.message);
        router.replace("/");
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [restaurantId, tableId, qrToken]);

  const addItem = (id: number) =>
    setCart((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));

  const removeItem = (id: number) =>
    setCart((prev) => {
      const qty = (prev[id] || 0) - 1;
      if (qty <= 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: qty };
    });

  const orderData = useMemo(() => {
    if (!menu) return { items: [], totalQty: 0, totalAmount: 0 };

    let totalQty = 0;
    let totalAmount = 0;
    const items: any[] = [];

    menu.categories.forEach((cat: any) => {
      cat.items.forEach((item: any) => {
        const qty = cart[item.id];
        if (qty > 0) {
          totalQty += qty;
          totalAmount += qty * Number(item.price);
          items.push({ ...item, qty });
        }
      });
    });

    return { items, totalQty, totalAmount };
  }, [cart, menu]);

  if (loading) {
    return <ActivityIndicator size="large" style={{ marginTop: 50 }} />;
  }

  if (!menu) {
    return (
      <Text style={{ marginTop: 50, textAlign: "center" }}>
        Menu not available
      </Text>
    );
  }

  return (
    <>
      <FlatList
        contentContainerStyle={{ paddingBottom: 120 }}
        data={menu.categories}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item: category }) => (
          <View style={{ marginBottom: 20, paddingHorizontal: 16 }}>
            <Text
              style={{ fontSize: 18, fontWeight: "bold", marginBottom: 10 }}
            >
              {category.name.toUpperCase()}
            </Text>

            {category.items.map((item: any) => {
              const quantity = cart[item.id] || 0;

              return (
                <View
                  key={item.id}
                  style={{
                    flexDirection: "row",
                    marginBottom: 12,
                    backgroundColor: "#fff",
                    padding: 10,
                    borderRadius: 8,
                  }}
                >
                  {item.image ? (
                    <Image
                      source={{ uri: item.image }}
                      style={{ width: 80, height: 80, borderRadius: 8 }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 80,
                        height: 80,
                        backgroundColor: "#eee",
                        borderRadius: 8,
                      }}
                    />
                  )}

                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ fontWeight: "600" }}>{item.name}</Text>

                    {!!item.description && (
                      <Text style={{ fontSize: 12, color: "#666" }}>
                        {item.description}
                      </Text>
                    )}

                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: 8,
                      }}
                    >
                      <Text style={{ fontWeight: "bold" }}>₹ {item.price}</Text>

                      {quantity === 0 ? (
                        <TouchableOpacity
                          onPress={() => addItem(item.id)}
                          style={{
                            backgroundColor: "black",
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 6,
                          }}
                        >
                          <Text style={{ color: "white" }}>ADD</Text>
                        </TouchableOpacity>
                      ) : (
                        <View
                          style={{ flexDirection: "row", alignItems: "center" }}
                        >
                          <TouchableOpacity onPress={() => removeItem(item.id)}>
                            <Text style={{ fontSize: 20 }}>−</Text>
                          </TouchableOpacity>

                          <Text style={{ marginHorizontal: 10 }}>
                            {quantity}
                          </Text>

                          <TouchableOpacity onPress={() => addItem(item.id)}>
                            <Text style={{ fontSize: 20 }}>+</Text>
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
        <View
          style={{
            position: "absolute",
            bottom: 0,
            width: "100%",
            backgroundColor: "black",
            padding: 16,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View>
            <Text style={{ color: "white" }}>{orderData.totalQty} Items</Text>
            <Text style={{ color: "white", fontWeight: "bold" }}>
              ₹ {orderData.totalAmount}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => {
              router.replace({
                pathname: "/Orders",
                params: {
                  order: JSON.stringify(orderData),
                  sessionToken,
                },
              });
            }}
          >
            <Text style={{ color: "white", fontWeight: "bold" }}>
              PLACE ORDER
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}

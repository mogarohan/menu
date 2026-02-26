import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const { width } = Dimensions.get("window");

// ⚠️ CHANGE THIS TO YOUR IP
const BASE_URL = "http://192.168.1.37:8000/api";

const THEME = {
  primary: "#1b98eb",
  secondary: "#2D3436",
  background: "#F8F9FA",
  cardBg: "#FFFFFF",
  textPrimary: "#2D3436",
  textSecondary: "#636E72",
  border: "#EFEFEF",
  success: "#55E6C1",
  danger: "#FF4757",
  warning: "#FFA502",
  overlay: "rgba(0,0,0,0.5)",
};

export default function Menu() {
  const { restaurantId, tableId, qrToken } = useLocalSearchParams();

  // --- STATE ---
  const [customerName, setCustomerName] = useState("");
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isPrimary, setIsPrimary] = useState(false);
  const [joinStatus, setJoinStatus] = useState<
    "active" | "pending" | "approved" | "rejected" | null
  >(null);

  // Join vs Split UI State
  const [existingHostName, setExistingHostName] = useState<string | null>(null);
  const [showJoinChoice, setShowJoinChoice] = useState(false);
  const [selectedMode, setSelectedMode] = useState<"new" | "join">("new");

  const [menu, setMenu] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [placingOrder, setPlacingOrder] = useState(false);

  // Cart & Notes State
  const [cart, setCart] = useState<Record<number, number>>({});
  const [itemNotes, setItemNotes] = useState<Record<number, string>>({});
  const [orderNote, setOrderNote] = useState("");
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);

  const [orders, setOrders] = useState<any[]>([]);

  // UI Navigation State
  const [activeTab, setActiveTab] = useState<"MENU" | "ORDERS" | "PAYMENT">(
    "MENU",
  );
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Host UI State
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [activeGuests, setActiveGuests] = useState<any[]>([]);
  const [showRequestsModal, setShowRequestsModal] = useState(false);

  // --- 1. RESET HELPER ---
  const clearSession = async () => {
    try {
      if (sessionToken) {
        await fetch(`${BASE_URL}/qr/session/leave`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_token: sessionToken }),
        });
      }

      const key = `session_${restaurantId}_${tableId}`;
      await AsyncStorage.removeItem(key);

      setSessionToken(null);
      setCustomerName("");
      setNameSubmitted(false);
      setMenu(null);
      setOrders([]);
      setIsPrimary(false);
      setJoinStatus(null);
      setActiveTab("MENU");

      await checkTableStatus();
    } catch (e) {
      console.error(e);
    }
  };

  // --- HELPER: CHECK IF TABLE HAS HOST ---
  const checkTableStatus = async () => {
    try {
      const res = await fetch(
        `${BASE_URL}/qr/validate/${restaurantId}/${tableId}/${qrToken}`,
      );
      const data = await res.json();

      if (data.has_active_host) {
        setExistingHostName(data.host_name);
        setShowJoinChoice(true);
        setSelectedMode("join");
      } else {
        setShowJoinChoice(false);
        setSelectedMode("new");
      }
    } catch (e) {}
  };

  // --- 2. INITIAL LOAD ---
  useEffect(() => {
    if (!restaurantId || !tableId) return;

    const loadAndValidateSession = async () => {
      setLoading(true);
      const key = `session_${restaurantId}_${tableId}`;

      try {
        const stored = await AsyncStorage.getItem(key);

        if (!stored) {
          await checkTableStatus();
          setLoading(false);
          return;
        }

        const parsed = JSON.parse(stored);
        const res = await fetch(
          `${BASE_URL}/menu/${restaurantId}/${tableId}/${qrToken}?session_token=${parsed.session_token}`,
        );

        if (!res.ok) {
          if (res.status === 403) {
            try {
              const err = await res.json();
              if (err.join_status === "rejected") {
                setJoinStatus("rejected");
                setNameSubmitted(true);
                setLoading(false);
                return;
              }
            } catch (e) {
              await clearSession();
              return;
            }
          } else {
            await clearSession();
            return;
          }
        }

        const data = await res.json();
        setSessionToken(parsed.session_token);
        setCustomerName(parsed.customer_name);

        if (data.session) {
          setIsPrimary(data.session.is_primary);
          setJoinStatus(data.session.join_status);
        } else {
          setIsPrimary(parsed.is_primary || false);
          setJoinStatus(parsed.join_status);
        }

        setNameSubmitted(true);

        if (
          res.ok &&
          (data.session?.join_status === "approved" || data.session?.is_primary)
        ) {
          setMenu(data);
          fetchOrders(parsed.session_token);
        }
      } catch (e) {
        await clearSession();
      } finally {
        setLoading(false);
      }
    };

    loadAndValidateSession();
  }, []);

  // --- 3. POLLING ---
  useEffect(() => {
    if (!sessionToken) return;
    let interval: NodeJS.Timeout;
    if (isPrimary) {
      interval = setInterval(fetchHostTableData, 5000);
    } else if (joinStatus === "pending") {
      interval = setInterval(checkMySessionStatus, 3000);
    }
    return () => clearInterval(interval);
  }, [sessionToken, isPrimary, joinStatus]);

  // --- 4. API ACTIONS ---
  const checkMySessionStatus = async () => {
    try {
      const res = await fetch(
        `${BASE_URL}/menu/${restaurantId}/${tableId}/${qrToken}?session_token=${sessionToken}`,
      );
      if (res.ok) {
        const data = await res.json();
        setMenu(data);
        setJoinStatus("approved");

        const key = `session_${restaurantId}_${tableId}`;
        const stored = await AsyncStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.join_status = "approved";
          await AsyncStorage.setItem(key, JSON.stringify(parsed));
        }
      } else if (res.status === 403) {
        const data = await res.json();
        if (data.join_status === "rejected") setJoinStatus("rejected");
      } else if (res.status === 401 || res.status === 404) {
        setJoinStatus("rejected");
      }
    } catch (e) {}
  };

  const startSession = async () => {
    if (!customerName.trim()) return Alert.alert("Required", "Enter name");
    setLoading(true);

    try {
      const key = `session_${restaurantId}_${tableId}`;
      await AsyncStorage.removeItem(key);

      const response = await fetch(
        `${BASE_URL}/qr/session/start/${restaurantId}/${tableId}/${qrToken}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            customer_name: customerName,
            mode: selectedMode,
          }),
        },
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.message);

      setSessionToken(data.session_token);
      setCustomerName(data.customer_name || customerName);
      setIsPrimary(data.is_primary);
      setJoinStatus(data.join_status);
      setNameSubmitted(true);
      setShowJoinChoice(false);

      await AsyncStorage.setItem(
        key,
        JSON.stringify({
          session_token: data.session_token,
          customer_name: data.customer_name || customerName,
          is_primary: data.is_primary,
          join_status: data.join_status,
        }),
      );

      if (
        data.is_primary ||
        data.join_status === "approved" ||
        data.join_status === "active"
      ) {
        await fetchMenu(data.session_token);
        fetchOrders(data.session_token);
      }
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchMenu = async (token: string) => {
    try {
      const res = await fetch(
        `${BASE_URL}/menu/${restaurantId}/${tableId}/${qrToken}?session_token=${token}`,
      );
      if (res.ok) setMenu(await res.json());
    } catch (err) {}
  };

  const fetchOrders = async (token: string) => {
    try {
      const res = await fetch(`${BASE_URL}/orders/session/${token}`);
      if (res.ok) setOrders(await res.json());
    } catch (err) {}
  };

  const fetchHostTableData = async () => {
    try {
      const res = await fetch(`${BASE_URL}/table/${tableId}/pending-requests`);
      if (res.ok) {
        const data = await res.json();
        setPendingRequests(data.pending || []);
        setActiveGuests(data.guests || []);
        if (data.pending?.length > 0 && !showRequestsModal)
          setShowRequestsModal(true);
      }
    } catch (e) {}
  };

  const respondToRequest = async (id: number, action: "approve" | "reject") => {
    try {
      await fetch(`${BASE_URL}/session/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      fetchHostTableData();
      if (pendingRequests.length <= 1) setShowRequestsModal(false);
    } catch (e) {}
  };

  const placeOrder = async () => {
    if (placingOrder || !sessionToken || orderData.totalQty === 0) return;
    setPlacingOrder(true);

    try {
      const response = await fetch(`${BASE_URL}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          table_id: tableId,
          session_token: sessionToken,
          notes: orderNote.trim() || null,
          items: orderData.items.map((i) => ({
            menu_item_id: i.id,
            quantity: i.qty,
            notes: itemNotes[i.id]?.trim() || null,
          })),
        }),
      });

      const data = await response.json();

      if (response.status === 401 || response.status === 403) {
        await clearSession();
        return Alert.alert("Session Expired", "Please start again.");
      }
      if (!response.ok)
        throw new Error(data.message || "Failed to place order.");

      // Reset everything on success
      setCart({});
      setItemNotes({});
      setOrderNote("");
      setShowCheckoutModal(false);
      fetchOrders(sessionToken);
      setShowSuccessModal(true);
    } catch (e: any) {
      Alert.alert("Order Failed", e.message);
    } finally {
      setPlacingOrder(false);
    }
  };

  // --- CALCULATIONS & FORMATTERS ---
  const formatPrice = (value: any) => {
    const num = parseFloat(value);
    return isNaN(num) ? "0.00" : num.toFixed(2);
  };

  const calculateItemTotal = (item: any) => {
    const price = item.unit_price || item.price || 0;
    const qty = item.quantity || item.qty || 0;
    const num = parseFloat(price);
    return isNaN(num) ? "0.00" : (num * qty).toFixed(2);
  };

  const updateCart = (id: number, delta: number) => {
    setCart((prev) => {
      const n = (prev[id] || 0) + delta;
      if (n <= 0) {
        const { [id]: _, ...r } = prev;

        // Remove the note if the item is removed from cart completely
        setItemNotes((prevNotes) => {
          const { [id]: __, ...restNotes } = prevNotes;
          return restNotes;
        });

        return r;
      }
      return { ...prev, [id]: n };
    });
  };

  const handleItemNoteChange = (id: number, text: string) => {
    setItemNotes((prev) => ({ ...prev, [id]: text }));
  };

  const orderData = useMemo(() => {
    if (!menu) return { items: [], totalQty: 0, totalPrice: 0 };
    let q = 0,
      p = 0,
      items: any[] = [];
    menu.categories.forEach((c: any) =>
      c.items.forEach((i: any) => {
        if (cart[i.id]) {
          q += cart[i.id];
          p += cart[i.id] * parseFloat(i.price);
          items.push({ ...i, qty: cart[i.id] });
        }
      }),
    );
    return { items, totalQty: q, totalPrice: p };
  }, [cart, menu]);

  const activeOrders = useMemo(() => {
    return orders.filter((order) => order.status.toLowerCase() !== "cancelled");
  }, [orders]);

  const grandTotal = useMemo(() => {
    return activeOrders.reduce(
      (sum, order) => sum + parseFloat(order.total_amount),
      0,
    );
  }, [activeOrders]);

  // ================= RENDER =================

  if (loading && !menu && nameSubmitted)
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={THEME.primary} />
      </View>
    );

  // 1. REJECTED SCREEN
  if (joinStatus === "rejected")
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="close-circle" size={80} color={THEME.danger} />
        <Text style={[styles.authTitle, { marginTop: 20 }]}>Access Denied</Text>
        <Text
          style={{
            color: THEME.textSecondary,
            textAlign: "center",
            paddingHorizontal: 30,
            marginBottom: 30,
          }}
        >
          The Host has declined your request to join this table.
        </Text>
        <TouchableOpacity onPress={clearSession} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>Start Over</Text>
        </TouchableOpacity>
      </View>
    );

  // 2. WAITING ROOM
  if (joinStatus === "pending")
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={THEME.warning} />
        <Text style={[styles.authTitle, { marginTop: 20 }]}>Waiting...</Text>
        <Text
          style={{
            color: THEME.textSecondary,
            textAlign: "center",
            paddingHorizontal: 30,
          }}
        >
          Waiting for{" "}
          <Text style={{ fontWeight: "bold" }}>
            {existingHostName || "Host"}
          </Text>{" "}
          to approve you.
        </Text>
        <TouchableOpacity onPress={clearSession} style={{ marginTop: 30 }}>
          <Text
            style={{
              color: THEME.textSecondary,
              textDecorationLine: "underline",
            }}
          >
            Cancel Request
          </Text>
        </TouchableOpacity>
      </View>
    );

  // 3. DECISION SCREEN / LOGIN
  if (!nameSubmitted)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
        <View style={styles.authContainer}>
          <Text style={styles.authEmoji}>🍽️</Text>
          <Text style={styles.authTitle}>Let's get started</Text>

          {showJoinChoice ? (
            <>
              <Text style={styles.authSubtitle}>
                Hosted by{" "}
                <Text style={{ fontWeight: "bold", color: "black" }}>
                  {existingHostName}
                </Text>
                . How do you want to order?
              </Text>

              <View
                style={{
                  gap: 15,
                  width: "100%",
                  marginTop: 10,
                  marginBottom: 20,
                }}
              >
                {/* Option A: JOIN */}
                <TouchableOpacity
                  style={[
                    styles.choiceBtn,
                    selectedMode === "join" && styles.choiceBtnActive,
                  ]}
                  onPress={() => setSelectedMode("join")}
                >
                  <Ionicons
                    name="people"
                    size={28}
                    color={
                      selectedMode === "join" ? "white" : THEME.textPrimary
                    }
                  />
                  <View>
                    <Text
                      style={[
                        styles.choiceTitle,
                        selectedMode === "join" && { color: "white" },
                      ]}
                    >
                      Join the Table
                    </Text>
                    <Text
                      style={[
                        styles.choiceDesc,
                        selectedMode === "join" && { color: "white" },
                      ]}
                    >
                      Orders added to {existingHostName}'s bill
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Option B: SPLIT */}
                <TouchableOpacity
                  style={[
                    styles.choiceBtn,
                    selectedMode === "new" && styles.choiceBtnActive,
                  ]}
                  onPress={() => setSelectedMode("new")}
                >
                  <Ionicons
                    name="receipt"
                    size={28}
                    color={selectedMode === "new" ? "white" : THEME.textPrimary}
                  />
                  <View>
                    <Text
                      style={[
                        styles.choiceTitle,
                        selectedMode === "new" && { color: "white" },
                      ]}
                    >
                      Separate Bill
                    </Text>
                    <Text
                      style={[
                        styles.choiceDesc,
                        selectedMode === "new" && { color: "white" },
                      ]}
                    >
                      Start your own separate tab
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <Text style={styles.authSubtitle}>
              Enter your name to start ordering.
            </Text>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Your Name</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. John Doe"
              value={customerName}
              onChangeText={setCustomerName}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { width: "100%" }]}
            onPress={startSession}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {showJoinChoice && selectedMode === "join"
                  ? "Request to Join"
                  : "Start Session"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );

  // 4. MAIN MENU SAFETY FALLBACK
  if (!menu)
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator color={THEME.primary} />
        <Text style={{ marginTop: 10, color: "gray" }}>Loading Menu...</Text>
        <TouchableOpacity
          onPress={() => fetchMenu(sessionToken!)}
          style={{ marginTop: 20 }}
        >
          <Text style={{ color: THEME.primary }}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={clearSession}
          style={{
            marginTop: 40,
            backgroundColor: "#f0f0f0",
            padding: 10,
            borderRadius: 8,
          }}
        >
          <Text style={{ color: "black" }}>Start Over</Text>
        </TouchableOpacity>
      </View>
    );

  // 5. MAIN APP UI WITH TABS
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Blurred Background Logo */}
      <View style={styles.backgroundContainer}>
        {menu?.restaurant?.logo && (
          <View style={styles.logoCircleWrapper}>
            <Image
              source={{ uri: menu.restaurant.logo }}
              style={styles.blurredBackgroundLogo}
            />
          </View>
        )}
      </View>

      <SafeAreaView style={styles.safeArea}>
        {/* HEADER */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.resName}>
              {menu?.restaurant?.name || "Restaurant"}
            </Text>
            <Text style={styles.taglineText}>
              Eating is the best experience
            </Text>
            <Text style={styles.tableInfo}>
              Table: {tableId} • {customerName} {isPrimary && "(Host)"}
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {/* Host Requests Icon */}
            {isPrimary && (
              <TouchableOpacity
                style={[
                  styles.billBtnHeader,
                  {
                    backgroundColor:
                      pendingRequests.length > 0 ? THEME.danger : THEME.primary,
                  },
                ]}
                onPress={() => setShowRequestsModal(true)}
              >
                <Ionicons name="people" size={16} color="white" />
                <Text
                  style={{
                    color: "white",
                    fontWeight: "bold",
                    marginLeft: 4,
                    fontSize: 12,
                  }}
                >
                  {activeGuests.length + pendingRequests.length}
                </Text>
              </TouchableOpacity>
            )}

            {/* Header Logo or Logout */}
            {menu?.restaurant?.logo ? (
              <Image
                source={{ uri: menu.restaurant.logo }}
                style={styles.headerLogo}
              />
            ) : null}
            <TouchableOpacity
              style={[styles.billBtnHeader, { backgroundColor: "#636E72" }]}
              onPress={() =>
                Alert.alert("Leave Table?", "This will clear your session.", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Leave",
                    style: "destructive",
                    onPress: clearSession,
                  },
                ])
              }
            >
              <Ionicons name="log-out-outline" size={18} color="white" />
            </TouchableOpacity>
          </View>
        </View>

        {/* SCROLLABLE CONTENT AREA */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ---- TAB: MENU ---- */}
          {activeTab === "MENU" && (
            <View style={styles.section}>
              {menu.categories.map((cat: any) => (
                <View key={cat.id} style={{ marginBottom: 25 }}>
                  <Text style={styles.categoryTitle}>{cat.name}</Text>
                  {cat.items.map((item: any) => {
                    const quantity = cart[item.id] || 0;
                    return (
                      <View key={item.id} style={styles.menuItemCard}>
                        <View style={styles.itemInfo}>
                          <Text style={styles.itemName}>{item.name}</Text>
                          <Text
                            style={styles.itemDescription}
                            numberOfLines={2}
                          >
                            {item.description}
                          </Text>
                          <Text style={styles.itemPrice}>
                            ₹{formatPrice(item.price)}
                          </Text>
                        </View>
                        <View style={styles.qtyContainer}>
                          {quantity > 0 ? (
                            <View style={styles.qtySelector}>
                              <TouchableOpacity
                                onPress={() => updateCart(item.id, -1)}
                                style={styles.qtyBtn}
                              >
                                <Ionicons
                                  name="remove"
                                  size={18}
                                  color={THEME.primary}
                                />
                              </TouchableOpacity>
                              <Text style={styles.qtyText}>{quantity}</Text>
                              <TouchableOpacity
                                onPress={() => updateCart(item.id, 1)}
                                style={styles.qtyBtn}
                              >
                                <Ionicons
                                  name="add"
                                  size={18}
                                  color={THEME.primary}
                                />
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <TouchableOpacity
                              onPress={() => updateCart(item.id, 1)}
                              style={styles.addBtn}
                            >
                              <Text style={styles.addBtnText}>ADD</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          )}

          {/* ---- TAB: ORDERS ---- */}
          {activeTab === "ORDERS" && (
            <View style={styles.section}>
              <Text style={styles.categoryTitle}>Your Orders Status</Text>
              {orders.length === 0 ? (
                <View style={styles.menuItemCard}>
                  <Text style={styles.itemDescription}>
                    No orders placed yet.
                  </Text>
                </View>
              ) : (
                orders.map((order) => (
                  <View key={order.id} style={{ marginBottom: 20 }}>
                    <View
                      style={[
                        styles.menuItemCard,
                        {
                          flexDirection: "column",
                          marginBottom: 0,
                          borderBottomLeftRadius: 0,
                          borderBottomRightRadius: 0,
                        },
                      ]}
                    >
                      <View style={styles.orderRow}>
                        <Text style={styles.itemName}>Order #{order.id}</Text>
                        <View
                          style={[
                            styles.statusBadge,
                            {
                              backgroundColor:
                                order.status === "completed"
                                  ? "#E3FCEF"
                                  : order.status === "cancelled"
                                    ? "#FFE5E5"
                                    : "#FFF4E5",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusText,
                              {
                                color:
                                  order.status === "completed"
                                    ? "#006644"
                                    : order.status === "cancelled"
                                      ? "#CC0000"
                                      : "#B95000",
                              },
                            ]}
                          >
                            {order.status.toUpperCase()}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.inlineOrderDetails}>
                      {order.items.map((item: any, index: number) => (
                        <View key={index} style={styles.receiptRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.receiptItemName}>
                              {item.item_name || "Item"}
                            </Text>
                            <Text style={styles.receiptItemQty}>
                              Qty: {item.quantity}
                            </Text>
                            {item.notes && (
                              <Text style={styles.receiptItemNote}>
                                Note: {item.notes}
                              </Text>
                            )}
                          </View>
                          <Text style={styles.receiptItemPrice}>
                            ₹{calculateItemTotal(item)}
                          </Text>
                        </View>
                      ))}

                      {order.notes && (
                        <View style={styles.receiptOrderNote}>
                          <Ionicons
                            name="information-circle-outline"
                            size={14}
                            color={THEME.textSecondary}
                          />
                          <Text style={styles.receiptOrderNoteText}>
                            {order.notes}
                          </Text>
                        </View>
                      )}

                      <View style={styles.divider} />
                      <View style={styles.orderRow}>
                        <Text style={styles.receiptTotalLabel}>
                          Order Total
                        </Text>
                        <Text style={styles.receiptTotalValue}>
                          ₹{formatPrice(order.total_amount)}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {/* ---- TAB: PAYMENT ---- */}
          {activeTab === "PAYMENT" && (
            <View style={styles.section}>
              <Text style={styles.categoryTitle}>Payment & Bill</Text>
              {activeOrders.length === 0 ? (
                <View style={styles.menuItemCard}>
                  <Text style={styles.itemDescription}>
                    No active bill generated yet. Place an order first!
                  </Text>
                </View>
              ) : (
                <View
                  style={[styles.menuItemCard, { flexDirection: "column" }]}
                >
                  <Text style={styles.billSectionTitle}>Order Summary</Text>
                  {activeOrders.map((order) => (
                    <View key={order.id} style={{ marginBottom: 12 }}>
                      <Text style={styles.billOrderHeader}>
                        Order #{order.id}{" "}
                        {order.customer_name !== customerName
                          ? `(By ${order.customer_name})`
                          : ""}
                      </Text>
                      {order.items.map((item: any, i: number) => (
                        <View key={i} style={styles.billRow}>
                          <Text style={styles.billItemText}>
                            {item.quantity} x {item.item_name}
                          </Text>
                          <Text style={styles.billItemPrice}>
                            ₹{calculateItemTotal(item)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ))}

                  <View style={styles.divider} />

                  <View style={styles.billRow}>
                    <Text style={styles.billTotalLabel}>Grand Total</Text>
                    <Text style={styles.billTotalValue}>
                      ₹{grandTotal.toFixed(2)}
                    </Text>
                  </View>

                  <Text style={styles.billNote}>
                    Please proceed to the counter to pay or ask your waiter for
                    assistance.
                  </Text>

                  <TouchableOpacity
                    style={styles.requestBillBtn}
                    onPress={() =>
                      Alert.alert("Success", "Waiter notified for payment!")
                    }
                  >
                    <Text style={styles.requestBillText}>Pay at Counter</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* FLOATING CHECKOUT BUTTON (Only on MENU Tab) */}
        {activeTab === "MENU" && orderData.totalQty > 0 && (
          <View style={styles.footerContainer}>
            <TouchableOpacity
              style={styles.checkoutBtn}
              onPress={() => setShowCheckoutModal(true)}
            >
              <View style={styles.checkoutInfo}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{orderData.totalQty}</Text>
                </View>
                <Text style={styles.checkoutText}>Review Order</Text>
              </View>
              <Text style={styles.checkoutPrice}>
                ₹{orderData.totalPrice.toFixed(2)}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* BOTTOM TAB BAR */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            onPress={() => setActiveTab("MENU")}
            style={styles.tab}
          >
            <Ionicons
              name="restaurant-outline"
              size={22}
              color={activeTab === "MENU" ? THEME.primary : "#94a3b8"}
            />
            <Text
              style={[
                styles.tabIcon,
                activeTab === "MENU" && { color: THEME.primary },
              ]}
            >
              Menu
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("ORDERS")}
            style={styles.tab}
          >
            <Ionicons
              name="time-outline"
              size={22}
              color={activeTab === "ORDERS" ? THEME.primary : "#94a3b8"}
            />
            <Text
              style={[
                styles.tabIcon,
                activeTab === "ORDERS" && { color: THEME.primary },
              ]}
            >
              Status
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("PAYMENT")}
            style={styles.tab}
          >
            <Ionicons
              name="card-outline"
              size={22}
              color={activeTab === "PAYMENT" ? THEME.primary : "#94a3b8"}
            />
            <Text
              style={[
                styles.tabIcon,
                activeTab === "PAYMENT" && { color: THEME.primary },
              ]}
            >
              Payment
            </Text>
          </TouchableOpacity>
        </View>

        {/* --- CHECKOUT MODAL (For Notes) --- */}
        <Modal visible={showCheckoutModal} animationType="slide" transparent>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalOverlay}
          >
            <View style={[styles.modalContent, { maxHeight: "90%" }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Review Order</Text>
                <TouchableOpacity onPress={() => setShowCheckoutModal(false)}>
                  <Ionicons
                    name="close-circle"
                    size={28}
                    color={THEME.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.sectionHeader}>Selected Items</Text>

                {orderData.items.map((item) => (
                  <View key={item.id} style={styles.checkoutItemRow}>
                    <View style={styles.checkoutItemTop}>
                      <Text style={styles.checkoutItemName}>
                        {item.qty}x {item.name}
                      </Text>
                      <Text style={styles.checkoutItemPrice}>
                        ₹{formatPrice(item.price * item.qty)}
                      </Text>
                    </View>

                    {/* Individual Item Note */}
                    <TextInput
                      style={styles.noteInput}
                      placeholder={`Add note for ${item.name} (e.g. No onions)`}
                      placeholderTextColor="#a1a1aa"
                      value={itemNotes[item.id] || ""}
                      onChangeText={(text) =>
                        handleItemNoteChange(item.id, text)
                      }
                      maxLength={100}
                    />
                  </View>
                ))}

                <View style={styles.divider} />

                {/* Kitchen / Order Note */}
                <Text style={[styles.sectionHeader, { marginTop: 10 }]}>
                  Order Instructions (Optional)
                </Text>
                <TextInput
                  style={[
                    styles.noteInput,
                    { height: 80, textAlignVertical: "top" },
                  ]}
                  placeholder="Any general requests for the kitchen? (e.g. Make it fast, extra plates)"
                  placeholderTextColor="#a1a1aa"
                  value={orderNote}
                  onChangeText={setOrderNote}
                  multiline
                  maxLength={200}
                />
              </ScrollView>

              {/* Place Order Footer */}
              <View style={styles.checkoutModalFooter}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 15,
                  }}
                >
                  <Text style={{ fontSize: 18, fontWeight: "bold" }}>
                    Total
                  </Text>
                  <Text
                    style={{
                      fontSize: 22,
                      fontWeight: "900",
                      color: THEME.primary,
                    }}
                  >
                    ₹{orderData.totalPrice.toFixed(2)}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    {
                      width: "100%",
                      flexDirection: "row",
                      justifyContent: "center",
                    },
                  ]}
                  onPress={placeOrder}
                  disabled={placingOrder}
                >
                  {placingOrder ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <>
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={22}
                        color="white"
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.primaryBtnText}>
                        Confirm & Place Order
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* SUCCESS MODAL */}
        <Modal visible={showSuccessModal} animationType="fade" transparent>
          <View style={styles.modalOverlayCenter}>
            <View style={styles.successModalContent}>
              <TouchableOpacity
                style={styles.closeModalBtn}
                onPress={() => setShowSuccessModal(false)}
              >
                <Ionicons name="close" size={24} color={THEME.textSecondary} />
              </TouchableOpacity>
              <View style={styles.successIconCircle}>
                <Ionicons name="checkmark-sharp" size={50} color="white" />
              </View>
              <Text style={styles.successTitle}>Thank You!</Text>
              <Text style={styles.successSubtitle}>
                Your order has been placed successfully.
              </Text>
              <TouchableOpacity
                style={styles.viewStatusBtn}
                onPress={() => {
                  setShowSuccessModal(false);
                  setActiveTab("ORDERS");
                }}
              >
                <Text style={styles.viewStatusBtnText}>Track Order Status</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* HOST DASHBOARD MODAL */}
        <Modal visible={showRequestsModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Table Management</Text>
                <TouchableOpacity onPress={() => setShowRequestsModal(false)}>
                  <Ionicons
                    name="close-circle"
                    size={28}
                    color={THEME.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <ScrollView>
                <Text style={styles.sectionHeader}>Join Requests</Text>
                {pendingRequests.length === 0 ? (
                  <Text style={styles.emptyText}>No pending requests.</Text>
                ) : (
                  pendingRequests.map((r) => (
                    <View key={r.id} style={styles.requestRow}>
                      <Text style={styles.requestName}>{r.customer_name}</Text>
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <TouchableOpacity
                          onPress={() => respondToRequest(r.id, "reject")}
                          style={[
                            styles.actionBtn,
                            { backgroundColor: "#ffe5e5" },
                          ]}
                        >
                          <Ionicons name="close" color="red" size={20} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => respondToRequest(r.id, "approve")}
                          style={[
                            styles.actionBtn,
                            { backgroundColor: "#e5fff5" },
                          ]}
                        >
                          <Ionicons name="checkmark" color="green" size={20} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}

                <Text style={[styles.sectionHeader, { marginTop: 20 }]}>
                  Active Guests
                </Text>
                {activeGuests.length === 0 ? (
                  <Text style={styles.emptyText}>
                    No guests have joined yet.
                  </Text>
                ) : (
                  activeGuests.map((g) => (
                    <View key={g.id} style={styles.requestRow}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <Ionicons
                          name="person"
                          size={16}
                          color={THEME.success}
                        />
                        <Text style={styles.requestName}>
                          {g.customer_name}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  safeArea: { flex: 1 },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  // Background Styling
  backgroundContainer: {
    position: "absolute",
    inset: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: -1,
  },
  logoCircleWrapper: {
    width: width * 0.7,
    height: width * 0.7,
    borderRadius: (width * 0.7) / 2,
    backgroundColor: "rgba(255,255,255,0.4)",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(27, 152, 235, 0.1)",
  },
  blurredBackgroundLogo: {
    width: "80%",
    height: "80%",
    resizeMode: "contain",
    opacity: 0.15,
  },

  // Header Styling
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  resName: { fontSize: 22, fontWeight: "900", color: "#0369a1" },
  taglineText: {
    fontSize: 12,
    color: "#0ea5e9",
    fontStyle: "italic",
    fontWeight: "600",
  },
  tableInfo: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 2,
  },
  headerLogo: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
  },
  billBtnHeader: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifycontent: "center",
  },

  // Tab Bar
  tabBar: {
    height: 70,
    backgroundColor: "#fff",
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    paddingBottom: 5,
  },
  tab: { flex: 1, justifyContent: "center", alignItems: "center" },
  tabIcon: { fontSize: 11, fontWeight: "800", color: "#94a3b8", marginTop: 4 },

  // Scroll Content
  scrollContent: { paddingBottom: 120 },
  section: { marginTop: 20, paddingHorizontal: 20 },
  categoryTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: THEME.textPrimary,
    marginBottom: 15,
    textTransform: "uppercase",
  },

  // Menu Item Card
  menuItemCard: {
    flexDirection: "row",
    backgroundColor: "white",
    padding: 15,
    borderRadius: 16,
    marginBottom: 15,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  itemInfo: { flex: 1, paddingRight: 10 },
  itemName: { fontSize: 16, fontWeight: "700" },
  itemDescription: {
    fontSize: 13,
    color: THEME.textSecondary,
    marginVertical: 4,
  },
  itemPrice: { fontSize: 15, fontWeight: "700", color: THEME.primary },

  // Quantity Selector
  qtyContainer: { justifyContent: "center" },
  addBtn: {
    backgroundColor: "#f0f9ff",
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: THEME.primary,
  },
  addBtnText: { color: THEME.primary, fontWeight: "700" },
  qtySelector: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 8,
  },
  qtyBtn: { padding: 8 },
  qtyText: { marginHorizontal: 5, fontWeight: "600" },

  // Floating Footer (Checkout)
  footerContainer: { position: "absolute", bottom: 85, left: 20, right: 20 },
  checkoutBtn: {
    backgroundColor: THEME.primary,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 15,
    elevation: 5,
  },
  checkoutInfo: { flexDirection: "row", alignItems: "center" },
  badge: {
    backgroundColor: "rgba(0,0,0,0.2)",
    paddingHorizontal: 8,
    borderRadius: 5,
    marginRight: 10,
    minWidth: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: { color: "white", fontWeight: "bold" },
  checkoutText: { color: "white", fontWeight: "700" },
  checkoutPrice: { color: "white", fontWeight: "800", fontSize: 17 },

  // Checkout Modal Styles
  checkoutItemRow: {
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderColor: "#f0f0f0",
  },
  checkoutItemTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  checkoutItemName: {
    fontWeight: "bold",
    fontSize: 16,
    color: THEME.textPrimary,
  },
  checkoutItemPrice: {
    fontWeight: "bold",
    fontSize: 16,
    color: THEME.textPrimary,
  },
  noteInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: THEME.textPrimary,
  },
  checkoutModalFooter: {
    marginTop: 20,
    paddingTop: 15,
    borderTopWidth: 1,
    borderColor: "#eee",
  },

  // Inline Orders Tab Styles
  orderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    alignItems: "center",
    marginBottom: 4,
  },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: "700" },
  inlineOrderDetails: {
    backgroundColor: "#FFFFFF",
    padding: 15,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: "#F0F0F0",
    elevation: 1,
    marginTop: -5,
  },
  receiptRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  receiptItemName: {
    fontWeight: "600",
    fontSize: 14,
    color: THEME.textPrimary,
  },
  receiptItemQty: { fontSize: 12, color: THEME.textSecondary },
  receiptItemNote: {
    fontSize: 11,
    color: THEME.danger,
    fontStyle: "italic",
    marginTop: 2,
  },
  receiptItemPrice: { fontWeight: "600", fontSize: 14 },
  receiptOrderNote: {
    backgroundColor: "#f8fafc",
    padding: 8,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
  },
  receiptOrderNoteText: {
    fontSize: 12,
    color: THEME.textSecondary,
    fontStyle: "italic",
    marginLeft: 5,
  },
  divider: { height: 1, backgroundColor: "#EFEFEF", marginVertical: 10 },
  receiptTotalLabel: { fontSize: 16, fontWeight: "bold" },
  receiptTotalValue: { fontSize: 16, fontWeight: "bold", color: THEME.primary },

  // Payment Tab Styles
  billSectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 15,
    color: THEME.textPrimary,
  },
  billOrderHeader: {
    fontWeight: "bold",
    color: THEME.primary,
    marginBottom: 5,
    fontSize: 14,
  },
  billRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  billItemText: { fontSize: 14, color: THEME.textSecondary },
  billItemPrice: { fontWeight: "600", color: THEME.textPrimary },
  billTotalLabel: { fontSize: 20, fontWeight: "800" },
  billTotalValue: { fontSize: 20, fontWeight: "800", color: THEME.primary },
  billNote: {
    textAlign: "center",
    color: "#999",
    fontSize: 12,
    marginTop: 15,
    fontStyle: "italic",
  },
  requestBillBtn: {
    backgroundColor: "black",
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
    alignItems: "center",
  },
  requestBillText: { color: "white", fontWeight: "bold", fontSize: 16 },

  // Center Screen Modal (Success)
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  successModalContent: {
    backgroundColor: "white",
    width: "90%",
    borderRadius: 24,
    padding: 30,
    alignItems: "center",
    position: "relative",
  },
  closeModalBtn: { position: "absolute", top: 15, right: 15 },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: THEME.success,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: THEME.textPrimary,
    marginBottom: 10,
  },
  successSubtitle: {
    fontSize: 15,
    color: THEME.textSecondary,
    textAlign: "center",
    marginBottom: 30,
    lineHeight: 22,
  },
  viewStatusBtn: {
    backgroundColor: THEME.primary,
    paddingVertical: 15,
    paddingHorizontal: 25,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  viewStatusBtnText: { color: "white", fontWeight: "bold", fontSize: 16 },

  // Bottom Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "white",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderColor: "#eee",
  },
  modalTitle: { fontSize: 20, fontWeight: "bold" },
  sectionHeader: {
    fontSize: 14,
    fontWeight: "bold",
    color: THEME.textSecondary,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  emptyText: { color: "gray", fontStyle: "italic", paddingVertical: 10 },
  requestRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: "#f5f5f5",
  },
  requestName: { fontSize: 16, fontWeight: "600" },
  actionBtn: { padding: 8, borderRadius: 8 },

  // Auth/Login Screen & Split Logic UI
  authContainer: { flex: 1, justifyContent: "center", padding: 25 },
  authEmoji: { fontSize: 50, marginBottom: 10 },
  authTitle: { fontSize: 28, fontWeight: "800", marginBottom: 5 },
  authSubtitle: { color: "gray", marginBottom: 30, fontSize: 15 },
  inputGroup: { marginBottom: 20, width: "100%" },
  label: { fontWeight: "600", marginBottom: 8 },
  textInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 15,
    backgroundColor: "#f9f9f9",
    fontSize: 16,
  },
  primaryBtn: {
    backgroundColor: THEME.primary,
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: "white", fontWeight: "bold", fontSize: 16 },

  choiceBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#E0E0E0",
    gap: 15,
  },
  choiceBtnActive: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primary,
  },
  choiceTitle: { fontWeight: "bold", fontSize: 16, marginBottom: 2 },
  choiceDesc: { fontSize: 13, color: THEME.textSecondary },
});

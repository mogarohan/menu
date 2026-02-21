import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ⚠️ CHANGE THIS TO YOUR IP
const BASE_URL = "http://192.168.1.32:8000/api";

const THEME = {
  primary: "#FF6B6B",
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
  const [cart, setCart] = useState<Record<number, number>>({});
  const [orders, setOrders] = useState<any[]>([]);

  // Host UI State
  const [showTotalBill, setShowTotalBill] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [activeGuests, setActiveGuests] = useState<any[]>([]); // To show who joined
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

      // 🔥 FIX 1: Fetch fresh table status immediately after leaving so "Join/Split" works
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
        setSelectedMode("join"); // Suggest join by default
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
          // No session? Check if table has a host so we can show Join/Split UI
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
              // If it's pending, let it proceed to restore state
            } catch (e) {
              await clearSession();
              return;
            }
          } else {
            await clearSession();
            return;
          }
        }

        // Restore Success
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

  // 🔥 FIX 2: Correctly read 403 Pending vs Rejected 🔥
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
        // Read JSON to check if still pending
        const data = await res.json();
        if (data.join_status === "rejected") {
          setJoinStatus("rejected");
        }
        // If data.join_status is "pending", it simply does nothing and keeps waiting.
      } else if (res.status === 401 || res.status === 404) {
        // Session destroyed entirely
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
            mode: selectedMode, // 'new' or 'join'
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

  // 🔥 FIX 3: Host fetches pending AND active guests
  const fetchHostTableData = async () => {
    try {
      const res = await fetch(`${BASE_URL}/table/${tableId}/pending-requests`);
      if (res.ok) {
        const data = await res.json();
        setPendingRequests(data.pending || []);
        setActiveGuests(data.guests || []);

        // Auto-open modal if there is a NEW pending request
        if (data.pending?.length > 0 && !showRequestsModal) {
          setShowRequestsModal(true);
        }
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
      // Refresh list immediately
      fetchHostTableData();
      if (pendingRequests.length <= 1) setShowRequestsModal(false);
    } catch (e) {}
  };

  const placeOrder = async () => {
    if (!sessionToken) return;
    try {
      const res = await fetch(`${BASE_URL}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          table_id: tableId,
          session_token: sessionToken,
          items: orderData.items.map((i) => ({
            menu_item_id: i.id,
            quantity: i.qty,
          })),
        }),
      });
      const data = await res.json();
      if (res.status === 403) return Alert.alert("Wait", data.message);
      if (!res.ok) throw new Error(data.message);

      setCart({});
      fetchOrders(sessionToken);
      Alert.alert("Success", "Order Placed");
    } catch (e: any) {}
  };

  // --- CALCULATIONS ---
  const updateCart = (id: number, delta: number) => {
    setCart((prev) => {
      const n = (prev[id] || 0) + delta;
      if (n <= 0) {
        const { [id]: _, ...r } = prev;
        return r;
      }
      return { ...prev, [id]: n };
    });
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

  const grandTotal = useMemo(
    () => orders.reduce((s, o) => s + parseFloat(o.total_amount), 0),
    [orders],
  );

  // ================= RENDER =================

  if (loading)
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

          {showJoinChoice ? (
            <>
              <Text style={styles.authTitle}>Table is Active</Text>
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
            <>
              <Text style={styles.authTitle}>Start Table</Text>
              <Text style={styles.authSubtitle}>
                You will be the host for this table.
              </Text>
            </>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Your Name</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. John"
              value={customerName}
              onChangeText={setCustomerName}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { width: "100%" }]}
            onPress={startSession}
          >
            <Text style={styles.primaryBtnText}>
              {showJoinChoice && selectedMode === "join"
                ? "Request to Join"
                : "Start Session"}
            </Text>
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

  // 5. MAIN APP UI
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea}>
        {/* HEADER */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerGreeting}>
              {customerName} {isPrimary && "(Host)"}
            </Text>
            <Text style={styles.headerSubtitle}>Table {tableId}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {isPrimary && (
              <TouchableOpacity
                style={[
                  styles.billBtnHeader,
                  {
                    backgroundColor:
                      pendingRequests.length > 0
                        ? THEME.danger
                        : THEME.secondary,
                  },
                ]}
                onPress={() => setShowRequestsModal(true)}
              >
                <Ionicons name="people" size={16} color="white" />
                <Text
                  style={{ color: "white", fontWeight: "bold", marginLeft: 4 }}
                >
                  {activeGuests.length + pendingRequests.length}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.billBtnHeader, { backgroundColor: "#636E72" }]}
              onPress={clearSession}
            >
              <Ionicons name="log-out-outline" size={18} color="white" />
            </TouchableOpacity>
            {orders.length > 0 && (
              <TouchableOpacity
                style={styles.billBtnHeader}
                onPress={() => setShowTotalBill(true)}
              >
                <Ionicons
                  name="receipt-outline"
                  size={16}
                  color="white"
                  style={{ marginRight: 4 }}
                />
                <Text style={{ color: "white", fontWeight: "bold" }}>
                  ₹{grandTotal.toFixed(0)}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* MENU LIST */}
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {menu.categories.map((cat: any) => (
            <View key={cat.id} style={styles.section}>
              <Text style={styles.categoryTitle}>{cat.name}</Text>
              {cat.items.map((item: any) => (
                <View key={item.id} style={styles.menuItemCard}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemDescription} numberOfLines={2}>
                      {item.description}
                    </Text>
                    <Text style={styles.itemPrice}>₹{item.price}</Text>
                  </View>
                  <View style={styles.qtyContainer}>
                    {cart[item.id] ? (
                      <View style={styles.qtySelector}>
                        <TouchableOpacity
                          onPress={() => updateCart(item.id, -1)}
                          style={styles.qtyBtn}
                        >
                          <Ionicons
                            name="remove"
                            size={16}
                            color={THEME.primary}
                          />
                        </TouchableOpacity>
                        <Text style={styles.qtyText}>{cart[item.id]}</Text>
                        <TouchableOpacity
                          onPress={() => updateCart(item.id, 1)}
                          style={styles.qtyBtn}
                        >
                          <Ionicons
                            name="add"
                            size={16}
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
              ))}
            </View>
          ))}
        </ScrollView>

        {/* CHECKOUT */}
        {orderData.totalQty > 0 && (
          <View style={styles.footerContainer}>
            <TouchableOpacity style={styles.checkoutBtn} onPress={placeOrder}>
              <Text style={styles.checkoutText}>
                {orderData.totalQty} Items | ₹{orderData.totalPrice.toFixed(2)}
              </Text>
              <Text style={styles.checkoutText}>Place Order</Text>
            </TouchableOpacity>
          </View>
        )}

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
                {/* Pending Requests Section */}
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

                {/* Active Guests Section */}
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
                      {/* Optional: Host can kick guest out here in future */}
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* BILL MODAL */}
        <Modal visible={showTotalBill} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Total Bill</Text>
                <TouchableOpacity onPress={() => setShowTotalBill(false)}>
                  <Ionicons
                    name="close-circle"
                    size={28}
                    color={THEME.textSecondary}
                  />
                </TouchableOpacity>
              </View>
              <ScrollView>
                {orders.map((o) => (
                  <View
                    key={o.id}
                    style={{
                      marginBottom: 15,
                      paddingBottom: 15,
                      borderBottomWidth: 1,
                      borderColor: "#eee",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        marginBottom: 5,
                      }}
                    >
                      <Text
                        style={{ fontWeight: "bold", color: THEME.primary }}
                      >
                        Order #{o.id}
                      </Text>
                      <Text
                        style={{ fontSize: 12, color: THEME.textSecondary }}
                      >
                        By {o.customer_name}
                      </Text>
                    </View>
                    {o.items.map((i: any, idx: number) => (
                      <View
                        key={idx}
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          marginTop: 4,
                        }}
                      >
                        <Text style={{ color: THEME.textPrimary }}>
                          {i.quantity} x {i.item_name}
                        </Text>
                        <Text style={{ fontWeight: "500" }}>
                          ₹{i.quantity * i.unit_price}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginTop: 10,
                  }}
                >
                  <Text style={{ fontSize: 22, fontWeight: "bold" }}>
                    Grand Total
                  </Text>
                  <Text
                    style={{
                      fontSize: 22,
                      fontWeight: "bold",
                      color: THEME.primary,
                    }}
                  >
                    ₹{grandTotal}
                  </Text>
                </View>
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderColor: "#eee",
  },
  headerGreeting: { fontSize: 18, fontWeight: "bold" },
  headerSubtitle: { color: "gray" },
  billBtnHeader: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.primary,
  },
  scrollContent: { padding: 15, paddingBottom: 100 },
  section: { marginBottom: 20 },
  categoryTitle: { fontSize: 20, fontWeight: "bold", marginBottom: 10 },
  menuItemCard: {
    flexDirection: "row",
    backgroundColor: "white",
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  itemInfo: { flex: 1, paddingRight: 10 },
  itemName: { fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  itemDescription: { color: "gray", fontSize: 12, marginBottom: 6 },
  itemPrice: { fontWeight: "bold", color: THEME.textPrimary },
  qtyContainer: { justifyContent: "center" },
  qtySelector: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 8,
    padding: 4,
  },
  qtyBtn: { padding: 4 },
  qtyText: { marginHorizontal: 10, fontWeight: "bold" },
  addBtn: {
    backgroundColor: "#fff0f0",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FFDCDC",
  },
  addBtnText: { color: THEME.primary, fontWeight: "bold" },
  footerContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderColor: "#eee",
  },
  checkoutBtn: {
    backgroundColor: THEME.primary,
    padding: 15,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  checkoutText: { color: "white", fontWeight: "bold", fontSize: 16 },

  // Modals
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
    maxHeight: "85%",
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

  // Auth Screen
  authContainer: { flex: 1, justifyContent: "center", padding: 30 },
  authEmoji: { fontSize: 50, marginBottom: 15 },
  authTitle: { fontSize: 28, fontWeight: "bold", marginBottom: 5 },
  authSubtitle: { fontSize: 15, color: THEME.textSecondary, marginBottom: 20 },
  inputGroup: { width: "100%", marginBottom: 20 },
  label: { fontWeight: "bold", marginBottom: 8, color: THEME.textPrimary },
  textInput: {
    borderWidth: 1,
    borderColor: "#E0E0E0",
    padding: 15,
    borderRadius: 12,
    fontSize: 16,
    backgroundColor: "#FAFAFA",
  },
  primaryBtn: {
    backgroundColor: THEME.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: "white", fontWeight: "bold", fontSize: 16 },

  // Choice UI
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
    backgroundColor: THEME.secondary,
    borderColor: THEME.secondary,
  },
  choiceTitle: { fontWeight: "bold", fontSize: 16, marginBottom: 2 },
  choiceDesc: { fontSize: 13, color: THEME.textSecondary },
});

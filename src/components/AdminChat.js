
import React, { useEffect, useState, useRef, useContext } from "react";
import io from "socket.io-client";
import axios from "axios";
import "../styles/AdminChat.css";
import { AuthContext } from "../context/AuthContext";

const SOCKET_URL = "http://localhost:5000";
const API_URL = "http://localhost:5000";

export default function AdminChat() {
  const { user } = useContext(AuthContext) || {};
  const adminId = user?._id || "651fa12b23f8a8c12c7d9d9c";

  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const socketRef = useRef(null);
  const endRef = useRef(null);
  const selectedRef = useRef(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const getId = (obj) => (obj?._id ? obj._id.toString() : obj?.id?.toString());

  // ✅ Kết nối socket
  useEffect(() => {
    socketRef.current = io(SOCKET_URL, { transports: ["websocket"] });

    socketRef.current.on("connect", () => {
      console.log("✅ Admin socket connected:", socketRef.current.id);
    });

    // 🔥 Nhận tin nhắn realtime
    socketRef.current.on("new_message", (msg) => {
      const convoId =
        typeof msg.conversationId === "object"
          ? msg.conversationId.toString()
          : msg.conversationId;
      console.log("📩 New message received:", msg);

      // ✅ Nếu đang xem đúng room thì append
      if (selectedRef.current && convoId === getId(selectedRef.current)) {
        setMessages((prev) => [...prev, msg]);
      }

      // ✅ Nếu là cuộc trò chuyện chưa mở, thêm vào danh sách
      setConversations((prev) => {
        const exists = prev.find((c) => getId(c) === convoId);
        return exists ? prev : [{ id: convoId, status: "pending" }, ...prev];
      });
    });

    // Khi có hội thoại mới
    socketRef.current.on("conversation_created", (conv) => {
      setConversations((prev) => {
        const exists = prev.some((c) => getId(c) === getId(conv));
        return exists ? prev : [conv, ...prev];
      });
    });

    socketRef.current.on("conversation_taken", (convo) => {
      setConversations((prev) =>
        prev.map((c) => (getId(c) === getId(convo) ? convo : c))
      );
      if (selectedRef.current && getId(selectedRef.current) === getId(convo)) {
        setSelected(convo);
      }
    });

    socketRef.current.on("conversation_closed", ({ conversationId }) => {
      setConversations((prev) =>
        prev.filter((c) => getId(c) !== conversationId.toString())
      );
      if (
        selectedRef.current &&
        getId(selectedRef.current) === conversationId.toString()
      ) {
        setSelected(null);
        setMessages([]);
      }
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  // ✅ Load danh sách hội thoại
  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API_URL}/conversations`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setConversations(res.data.data || []);
    } catch (err) {
      console.error("❌ Error loading conversations:", err);
    }
  };

  // ✅ Khi admin click chọn user để xem tin nhắn
  const loadMessages = async (conv) => {
    try {
      if (selected && getId(selected) === getId(conv)) return;
      setSelected(conv);

      // ⚡ Join room TRƯỚC khi load messages
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit("join_room", getId(conv));
        console.log("📥 Admin joined room:", getId(conv));
      }

      const token = localStorage.getItem("token");
      const res = await axios.get(
        `${API_URL}/messages/${getId(conv)}/messages`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      setMessages(res.data.data || []);

      // Đánh dấu admin nhận xử lý hội thoại này
      socketRef.current.emit("take_conversation", {
        staffId: adminId,
        conversationId: getId(conv),
      });
    } catch (err) {
      console.error("❌ Error loading messages:", err);
    }
  };

  // ✅ Gửi tin nhắn từ admin
  const handleSend = () => {
    if (!input.trim() || !selected) return;
    const msg = {
      conversationId: getId(selected),
      senderId: adminId,
      messageText: input.trim(),
    };
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit("send_message", msg);
      setInput("");
    }
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="admin-chat-container">
      <aside className="chat-sidebar">
        <div className="sidebar-header">
          <h3>💬 Danh sách cuộc trò chuyện</h3>
        </div>
        <div className="conversation-list">
          {conversations.length === 0 ? (
            <p className="empty">Không có cuộc trò chuyện nào</p>
          ) : (
            conversations.map((c) => {
              const userName =
                c.accountId && typeof c.accountId === "object"
                  ? c.accountId.username ||
                    c.accountId.email ||
                    c.accountId._id
                  : c.accountId || "Không xác định";
              return (
                <div
                  key={getId(c)}
                  onClick={() => loadMessages(c)}
                  className={`conversation-item ${
                    selected && getId(selected) === getId(c) ? "active" : ""
                  }`}
                >
                  <div className="user-info">
                    <span className="user-name">{userName}</span>
                    <span className={`status ${c.status}`}>{c.status}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      <main className="chat-main">
        {!selected ? (
          <div className="empty-chat">
            👈 Chọn cuộc trò chuyện để xem tin nhắn
          </div>
        ) : (
          <>
            <div className="chat-header">
              <h4>💬 {selected.accountId?.username || selected.accountId}</h4>
              <span className={`chat-status ${selected.status}`}>
                {selected.status}
              </span>
            </div>

            <div className="chat-body">
              {messages.map((m, i) => {
                const sender =
                  typeof m.senderId === "object"
                    ? m.senderId?._id?.toString() || m.senderId?.toString()
                    : m.senderId?.toString();
                const isAdmin = sender === adminId.toString();
                return (
                  <div
                    key={m._id || m.id || i}
                    className={`chat-bubble ${isAdmin ? "admin" : "user"}`}
                  >
                    <div className="bubble-text">{m.messageText}</div>
                  </div>
                );
              })}
              <div ref={endRef}></div>
            </div>

            <div className="chat-footer">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Nhập tin nhắn..."
                disabled={selected.status === "closed"}
              />
              <button
                onClick={handleSend}
                disabled={selected.status === "closed"}
              >
                Gửi
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

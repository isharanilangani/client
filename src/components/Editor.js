import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import Quill from "quill";
import "quill/dist/quill.snow.css";

const SAVE_INTERVAL_MS = 2000;
const TOOLBAR_OPTIONS = [
  [{ header: [1, 2, 3, 4, 5, 6, false] }],
  [{ font: [] }],
  [{ list: "ordered" }, { list: "bullet" }],
  ["bold", "italic", "underline", "strike"],
  [{ color: [] }, { background: [] }],
  [{ script: "sub" }, { script: "super" }],
  [{ align: [] }],
  ["blockquote", "code-block"],
  ["link", "image", "video"],
  ["clean"],
];

const Editor = ({ docId }) => {
  const wrapperRef = useRef();
  const socketRef = useRef();
  const quillRef = useRef();
  const [isReady, setIsReady] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUser, setTypingUser] = useState(null);
  const [currentRole, setCurrentRole] = useState(
    localStorage.getItem("role") || "viewer"
  );

  const username = localStorage.getItem("username") || "Guest";

  useEffect(() => {
    socketRef.current = io("http://localhost:3001");
    const socket = socketRef.current;

    socket.on("update-users", (users) => {
      setOnlineUsers(users);
    });

    socket.on("user-typing", (username) => {
      setTypingUser(username);
      setTimeout(() => setTypingUser(null), 2000);
    });

    socket.on("role-updated", ({ username, newRole }) => {
      const localUsername = localStorage.getItem("username") || "Guest";
      if (username === localUsername) {
        setCurrentRole(newRole);
        if (quillRef.current) {
          if (newRole === "editor") {
            quillRef.current.enable();
          } else {
            quillRef.current.disable();
          }
        }
      }
    });

    return () => {
      socket.disconnect();
      socket.off("update-users");
      socket.off("user-typing");
      socket.off("role-updated");
    };
  }, []);

  useEffect(() => {
    if (!socketRef.current || !wrapperRef.current) return;

    const wrapper = wrapperRef.current;
    wrapper.innerHTML = "";

    const editorDiv = document.createElement("div");
    wrapper.append(editorDiv);

    const quill = new Quill(editorDiv, {
      theme: "snow",
      modules: { toolbar: TOOLBAR_OPTIONS },
    });

    quill.disable();
    quill.setText("Loading...");
    quillRef.current = quill;

    const username = localStorage.getItem("username") || "Guest";
    socketRef.current.emit("join-document", {
      docId,
      username,
      role: currentRole,
    });

    socketRef.current.once("load-document", ({ data, role }) => {
      quill.setContents(data);
      if (role === "editor") {
        quill.enable();
      } else {
        quill.disable();
      }
      setIsReady(true);
    });

    return () => {
      if (wrapper) {
        wrapper.innerHTML = "";
      }
    };
  }, [docId, currentRole]);

  // Emit typing + text change
  useEffect(() => {
    if (!quillRef.current || !socketRef.current || !isReady) return;

    const quill = quillRef.current;
    const socket = socketRef.current;

    const changeHandler = (delta, oldDelta, source) => {
      if (source !== "user") return;
      socket.emit("send-changes", delta);
      socket.emit("typing", username);
    };

    quill.on("text-change", changeHandler);

    return () => {
      quill.off("text-change", changeHandler);
    };
  }, [isReady, username]);

  useEffect(() => {
    if (!socketRef.current || !quillRef.current) return;

    const socket = socketRef.current;
    const quill = quillRef.current;

    socket.on("receive-changes", (delta) => {
      quill.updateContents(delta);
    });

    return () => {
      socket.off("receive-changes");
    };
  }, []);

  useEffect(() => {
    if (!socketRef.current || !quillRef.current) return;

    const interval = setInterval(() => {
      socketRef.current.emit("save-document", quillRef.current.getContents());
    }, SAVE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [docId]);

  const handleUndo = async () => {
    try {
      const response = await fetch(`http://localhost:3001/undo/${docId}`, {
        method: "GET",
      });
      const { delta } = await response.json();
      if (delta && quillRef.current) {
        quillRef.current.setContents(delta);
        socketRef.current.emit("send-changes", delta);
      }
    } catch (error) {
      console.error("Undo failed:", error);
    }
  };  

  const handleRoleChange = (targetUsername, newRole) => {
    socketRef.current.emit("change-role", {
      docId,
      targetUsername,
      newRole,
    });
  };

  return (
    <div>
      <div className="p-2 text-sm text-gray-700">
        <strong>Online:</strong> {onlineUsers.join(", ")}
        {typingUser && (
          <span className="ml-4 text-blue-500 italic">
            {typingUser} is typing...
          </span>
        )}
        <div className="mt-2">
          <label className="mr-2 font-semibold">Change Role:</label>
          <select
            onChange={(e) =>
              handleRoleChange(localStorage.getItem("username"), e.target.value)
            }
            value={currentRole}
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
        </div>
      </div>
      <button
        onClick={handleUndo}
        className="bg-blue-500 text-white px-3 py-1 rounded mt-2 mb-2 hover:bg-blue-600"
      >
        Undo
      </button>

      <div className="container" ref={wrapperRef}></div>
    </div>
  );
};

export default Editor;

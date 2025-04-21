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
  const [comments, setComments] = useState([]);
  const [selectionRange, setSelectionRange] = useState(null);
  const [commentText, setCommentText] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUser, setTypingUser] = useState(null);
  const [currentRole, setCurrentRole] = useState(
    localStorage.getItem("role") || "viewer"
  );

  const username = localStorage.getItem("username") || "Guest";

  const handleAddComment = () => {
    if (!selectionRange || !commentText.trim()) return;

    const quill = quillRef.current;
    const text = quill.getText(selectionRange.index, selectionRange.length);

    const comment = {
      id: Date.now(),
      username,
      text,
      comment: commentText,
      range: selectionRange,
    };

    setComments((prev) => [...prev, comment]);
    setCommentText("");
    setSelectionRange(null);

    // Emit the comment to the server (optional, if you want to share comments with others)
    socketRef.current.emit("add-comment", { docId, comment });
  };

  useEffect(() => {
    if (!quillRef.current) return;
    const quill = quillRef.current;

    const handleSelectionChange = (range, oldRange, source) => {
      const text = quill.getText(range?.index, range?.length);
      if (range && range.length > 0 && text.trim() !== "") {
        setSelectionRange(range);
      } else {
        setSelectionRange(null);
      }
    };

    quill.on("selection-change", handleSelectionChange);
    return () => quill.off("selection-change", handleSelectionChange);
  }, []);

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
          newRole === "editor"
            ? quillRef.current.enable()
            : quillRef.current.disable();
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
    if (!socketRef.current) return;

    const socket = socketRef.current;

    socket.on("new-comment", (comment) => {
      setComments((prev) => [...prev, comment]);
    });

    return () => {
      socket.off("new-comment");
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
      role === "editor" ? quill.enable() : quill.disable();
      setIsReady(true);
    });

    return () => {
      wrapper.innerHTML = "";
    };
  }, [docId, currentRole]);

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

  const cursorsRef = useRef({});
  const [cursors, setCursors] = useState({});

  function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color =
      "#" +
      ((hash >> 24) & 0xff).toString(16).padStart(2, "0") +
      ((hash >> 16) & 0xff).toString(16).padStart(2, "0") +
      ((hash >> 8) & 0xff).toString(16).padStart(2, "0");
    return color.slice(0, 7);
  }

  useEffect(() => {
    if (!socketRef.current || !quillRef.current) return;

    const socket = socketRef.current;
    const quill = quillRef.current;

    socket.on("cursor-update", ({ username, range, socketId }) => {
      if (!range || !quill || socketId === socket.id) return;

      const cursorColor = stringToColor(username);
      const cursorEl = document.createElement("span");
      cursorEl.classList.add("custom-cursor");
      cursorEl.style.borderLeft = `2px solid ${cursorColor}`;
      cursorEl.style.height = "1em";
      cursorEl.style.marginLeft = "-1px";
      cursorEl.style.position = "absolute";
      cursorEl.style.zIndex = "100";
      cursorEl.title = username;

      const cursorIndex = range.index;
      const [leaf, offset] = quill.getLeaf(cursorIndex);
      if (!leaf) return;

      const leafDom = leaf.domNode;
      const rect = leafDom.getBoundingClientRect();
      const containerRect = quill.container.getBoundingClientRect();

      cursorEl.style.top = `${rect.top - containerRect.top}px`;
      cursorEl.style.left = `${rect.left - containerRect.left + offset}px`;

      quill.container.appendChild(cursorEl);

      if (cursorsRef.current[socketId]) {
        cursorsRef.current[socketId].remove();
      }

      cursorsRef.current[socketId] = cursorEl;
      setCursors({ ...cursorsRef.current });
    });

    return () => {
      Object.values(cursorsRef.current).forEach((el) => el.remove());
      socket.off("cursor-update");
    };
  }, []);

  useEffect(() => {
    if (!quillRef.current || !socketRef.current) return;

    const quill = quillRef.current;
    const socket = socketRef.current;

    const handleSelectionChange = (range, oldRange, source) => {
      if (source !== "user" || !range) return;

      socket.emit("cursor-position", {
        docId,
        username,
        range,
      });
    };

    quill.on("selection-change", handleSelectionChange);

    return () => {
      quill.off("selection-change", handleSelectionChange);
    };
  }, [isReady, username]);

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
    <div className="flex h-screen overflow-hidden">
      {/* Editor Area */}
      <div className="flex-grow flex flex-col">
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
              onChange={(e) => handleRoleChange(username, e.target.value)}
              value={currentRole}
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleUndo}
          className="bg-blue-500 text-white px-3 py-1 rounded mt-2 mb-2 hover:bg-blue-600 ml-2 w-fit"
        >
          Undo
        </button>

        <div
          className="flex-grow overflow-auto border m-2"
          ref={wrapperRef}
        ></div>
      </div>

      {/* Comment Sidebar */}
      <div className="w-80 bg-gray-50 border-l border-gray-300 h-full overflow-y-auto p-4">
        <h2 className="font-semibold mb-2">Comments</h2>

        {comments.map((cmt) => (
          <div key={cmt.id} className="mb-3 p-2 border rounded">
            <div className="text-sm text-gray-600">
              <strong>{cmt.username}</strong> commented:
            </div>
            <div className="text-sm italic bg-gray-100 p-1 mt-1">
              {cmt.text}
            </div>
            <div className="text-sm mt-1">{cmt.comment}</div>
          </div>
        ))}

        {selectionRange && (
          <div className="mt-4">
            <textarea
              className="w-full p-2 border rounded"
              rows="2"
              value={commentText}
              placeholder="Write a comment..."
              onChange={(e) => setCommentText(e.target.value)}
            />
            <button
              onClick={handleAddComment}
              className="bg-blue-500 text-white px-3 py-1 mt-2 rounded hover:bg-blue-600"
            >
              Add Comment
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Editor;

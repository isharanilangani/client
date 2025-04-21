const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const connectDB = require("./db");
const Document = require("./models/Document");

connectDB();

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "http://localhost:3000" },
});

const defaultValue = {
  ops: [{ insert: "Welcome to your real-time document!\n" }],
};

const documents = {};
const userRoles = new Map();
const activeUsers = {};

io.on("connection", (socket) => {
  socket.on(
    "join-document",
    async ({ docId, username, role: requestedRole }) => {
      const document = await findOrCreateDocument(docId);

      // Default to viewer if not provided
      const role = requestedRole || "viewer";

      // Find or add user to document's user list
      let user = document.users.find((u) => u.username === username);
      if (!user) {
        user = { username, role };
        document.users.push(user);
        await document.save();
      } else if (user.role !== role) {
        user.role = role;
        await document.save();
      }

      // Track role in memory
      userRoles.set(`${docId}:${username}`, user.role);

      socket.join(docId);

      // Ensure valid Delta format
      const validData =
        document.data && document.data.ops ? document.data : defaultValue;

      console.log(`User "${username}" joined document "${docId}" as ${role}`);
      console.log(
        "Sending data to client:",
        JSON.stringify(validData, null, 2)
      );

      socket.emit("load-document", { data: validData, role: user.role });

      // Update online users list
      if (!activeUsers[docId]) activeUsers[docId] = [];
      if (!activeUsers[docId].includes(username)) {
        activeUsers[docId].push(username);
      }
      io.to(docId).emit("update-users", activeUsers[docId]);

      // Broadcast changes if user is an editor
      socket.on("send-changes", async (delta) => {
        const currentRole = userRoles.get(`${docId}:${username}`);
        if (currentRole !== "editor") return;

        // Apply changes and store the full content
        try {
          const doc = await Document.findById(docId);
          if (!doc) return;

          // Apply incoming delta to current content
          const QuillDelta = require("quill-delta");
          const currentData = new QuillDelta(doc.data || defaultValue);
          const updatedData = currentData.compose(new QuillDelta(delta));

          doc.data = updatedData;
          doc.versions.push({
            delta: updatedData,
            username,
          });
          await doc.save();

          socket.to(docId).emit("receive-changes", delta);
        } catch (err) {
          console.error("Failed to store version:", err);
        }
      });

      socket.on("typing", () => {
        socket.to(docId).emit("user-typing", username);
      });

      socket.on("save-document", async (data) => {
        // Save only if Delta format
        if (data && data.ops) {
          await Document.findByIdAndUpdate(docId, { data });
          console.log(`Document "${docId}" saved.`);
        }
      });

      socket.on("change-role", async ({ docId, targetUsername, newRole }) => {
        try {
          const document = await Document.findById(docId);
          if (!document) return;

          const user = document.users.find(
            (u) => u.username === targetUsername
          );
          if (!user) return;

          user.role = newRole;
          await document.save();

          // Update in-memory role map
          userRoles.set(`${docId}:${targetUsername}`, newRole);

          // Notify all clients in room
          io.to(docId).emit("role-updated", {
            username: targetUsername,
            newRole,
          });

          console.log(
            `Role of "${targetUsername}" changed to "${newRole}" in doc "${docId}"`
          );
        } catch (err) {
          console.error("Error changing role:", err);
        }
      });

      socket.on("cursor-position", ({ docId, username, range }) => {
        socket.to(docId).emit("cursor-update", {
          username,
          range,
          socketId: socket.id,
        });
      });

      socket.on("add-comment", async ({ docId, comment }) => {
        try {
          // Save comment in DB (if necessary)
          const doc = await Document.findById(docId);
          if (!doc) return;

          doc.comments.push(comment); // Save comment to document (optional)
          await doc.save();

          // Broadcast the new comment to all users in the document room
          io.to(docId).emit("new-comment", comment);
        } catch (err) {
          console.error("Error adding comment:", err);
        }
      });

      socket.on("disconnect", () => {
        activeUsers[docId] = activeUsers[docId].filter((u) => u !== username);
        io.to(docId).emit("update-users", activeUsers[docId]);
      });
    }
  );
});

server.listen(3001, () => console.log("Server running on port 3001"));

const findOrCreateDocument = async (id) => {
  if (id == null) return null;

  let document = await Document.findById(id);
  if (document) return document;

  return await Document.create({ _id: id, data: defaultValue, users: [] });
};

app.get("/undo/:docId", async (req, res) => {
  const { docId } = req.params;

  try {
    const doc = await Document.findById(docId);
    if (!doc || !doc.versions || doc.versions.length < 2)
      return res.status(400).json({ message: "No undo available" });

    // Remove the last delta (latest)
    doc.versions.pop();

    // Get the second last delta as the new state
    const lastDelta =
      doc.versions[doc.versions.length - 1]?.delta || defaultValue;

    doc.data = lastDelta;
    await doc.save();

    res.json({ delta: lastDelta });
  } catch (err) {
    console.error("Undo error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

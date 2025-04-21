const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: String,
  role: { type: String, enum: ["editor", "viewer"], default: "viewer" },
});

const VersionSchema = new mongoose.Schema({
  delta: Object,
  timestamp: { type: Date, default: Date.now },
  username: String,
});

const DocumentSchema = new mongoose.Schema({
  _id: String,
  data: {
    type: Object,
    default: {
      ops: [{ insert: "Welcome to your real-time document!\n" }],
    },
  },
  users: [UserSchema],
  versions: [VersionSchema],
});

module.exports = mongoose.model("Document", DocumentSchema);

import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

const SAVE_INTERVAL_MS = 2000;
const TOOLBAR_OPTIONS = [
  [{ header: [1, 2, 3, 4, 5, 6, false] }],
  [{ font: [] }],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ color: [] }, { background: [] }],
  [{ script: 'sub' }, { script: 'super' }],
  [{ align: [] }],
  ['blockquote', 'code-block'],
  ['link', 'image', 'video'],
  ['clean'],
];

const Editor = ({ docId }) => {
  const wrapperRef = useRef();
  const socketRef = useRef();
  const quillRef = useRef();
  const [isReady, setIsReady] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUser, setTypingUser] = useState(null);

  useEffect(() => {
    socketRef.current = io('http://localhost:3001');

    const socket = socketRef.current;

    socket.on("update-users", (users) => {
      setOnlineUsers(users);
    });

    socket.on("user-typing", (username) => {
      setTypingUser(username);
      setTimeout(() => setTypingUser(null), 2000); // remove after 2s
    });

    return () => {
      socket.disconnect();
      socket.off("update-users");
      socket.off("user-typing");
    };
  }, []);

  useEffect(() => {
    if (!socketRef.current || !wrapperRef.current) return;

    wrapperRef.current.innerHTML = '';

    const editorDiv = document.createElement('div');
    wrapperRef.current.append(editorDiv);

    const quill = new Quill(editorDiv, {
      theme: 'snow',
      modules: { toolbar: TOOLBAR_OPTIONS },
    });

    quill.disable();
    quill.setText("Loading...");
    quillRef.current = quill;

    const username = localStorage.getItem('username') || 'Guest';
    socketRef.current.emit("join-document", { docId, username });

    socketRef.current.once('load-document', (document) => {
      quill.setContents(document);
      quill.enable();
      setIsReady(true);
    });

    return () => {
      if (wrapperRef.current) {
        wrapperRef.current.innerHTML = '';
      }
    };
  }, [docId]);

  useEffect(() => {
    if (!quillRef.current || !socketRef.current || !isReady) return;

    const quill = quillRef.current;
    const socket = socketRef.current;

    const changeHandler = (delta, oldDelta, source) => {
      if (source !== 'user') return;
      socket.emit('send-changes', delta);
      socket.emit('typing'); // notify typing
    };

    quill.on('text-change', changeHandler);

    return () => {
      quill.off('text-change', changeHandler);
    };
  }, [isReady]);

  useEffect(() => {
    if (!socketRef.current || !quillRef.current) return;

    const socket = socketRef.current;
    const quill = quillRef.current;

    socket.on('receive-changes', (delta) => {
      quill.updateContents(delta);
    });

    return () => {
      socket.off('receive-changes');
    };
  }, []);

  useEffect(() => {
    if (!socketRef.current || !quillRef.current) return;

    const interval = setInterval(() => {
      socketRef.current.emit('save-document', quillRef.current.getContents());
    }, SAVE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [docId]);

  return (
    <div>
      <div className="p-2 text-sm text-gray-700">
        <strong>Online:</strong> {onlineUsers.join(', ')}
        {typingUser && (
          <span className="ml-4 text-blue-500 italic">{typingUser} is typing...</span>
        )}
      </div>
      <div className="container" ref={wrapperRef}></div>
    </div>
  );
};

export default Editor;

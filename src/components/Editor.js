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

  useEffect(() => {
    socketRef.current = io('http://localhost:3001');

    return () => {
      socketRef.current.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!socketRef.current || !wrapperRef.current) return;

    const editorDiv = document.createElement('div');
    wrapperRef.current.append(editorDiv);
    const quill = new Quill(editorDiv, {
      theme: 'snow',
      modules: { toolbar: TOOLBAR_OPTIONS },
    });
    quill.disable();
    quill.setText("Loading...");
    quillRef.current = quill;

    socketRef.current.once('load-document', (document) => {
      quill.setContents(document);
      quill.enable();
      setIsReady(true);
    });

    socketRef.current.emit('join-document', docId);

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

    const handler = (delta, oldDelta, source) => {
      if (source !== 'user') return;
      socket.emit('send-changes', delta, docId);
    };

    quill.on('text-change', handler);

    return () => {
      quill.off('text-change', handler);
    };
  }, [isReady, docId]);

  useEffect(() => {
    if (!quillRef.current || !socketRef.current) return;

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
      socketRef.current.emit('save-document', quillRef.current.getContents(), docId);
    }, SAVE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [docId]);

  return <div className="container" ref={wrapperRef}></div>;
};

export default Editor;

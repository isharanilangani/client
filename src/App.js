import React from 'react';
import Home from './components/Home';
import Editor from './components/Editor';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { v4 as uuidV4 } from 'uuid';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/documents/:id" element={<DocRoute />} />
      </Routes>
    </Router>
  );
}

function DocRoute() {
  const { id } = useParams();
  return <Editor docId={id} />;
}

export default App;

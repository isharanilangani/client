import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState('');

  const handleJoin = () => {
    if (!name.trim()) return;

    // Save name to browser (temporary)
    localStorage.setItem('username', name);

    // Navigate to the document editor
    const docId = 'my-shared-doc'; // you can use uuid() later
    navigate(`/documents/${docId}`);
  };

  return (
    <div style={{ padding: 40 }}>
      <h2>Welcome! Enter your name to join</h2>
      <input
        type="text"
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button onClick={handleJoin}>Join Document</button>
    </div>
  );
}

export default Home;

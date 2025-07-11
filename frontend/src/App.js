// frontend/src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { TelegramProvider } from './context/TelegramContext';
import Home from './pages/Home';
import UserProfile from './components/UserProfile';
import ResultFilterPage from './pages/ResultFilterPage';
import './App.css';

function App() {
  return (
    <TelegramProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/profile" element={<UserProfile />} />
          <Route path="/filter-results" element={<ResultFilterPage />} />
        </Routes>
      </Router>
    </TelegramProvider>
  );
}

export default App;
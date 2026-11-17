import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AdminAuthGate } from './components/auth/AdminAuthGate';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AdminAuthGate><App /></AdminAuthGate>
  </React.StrictMode>
);

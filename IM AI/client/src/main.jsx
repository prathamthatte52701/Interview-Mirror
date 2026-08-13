import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ToastHost from './components/Toast.jsx';
import './styles/global.css';
import './styles/auth.css';
import './styles/admin.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <ToastHost />
  </React.StrictMode>
);

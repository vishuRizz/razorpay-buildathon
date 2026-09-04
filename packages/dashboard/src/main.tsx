import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import { API_BASE } from './lib/api';
import './index.css';
import App from './App';

if (API_BASE) {
  axios.defaults.baseURL = API_BASE;
  axios.defaults.withCredentials = false;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

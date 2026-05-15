import React from 'react';
import ReactDOM from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { WalletProvider } from './contexts/WalletContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <WalletProvider>
          <App />
        </WalletProvider>
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>,
);

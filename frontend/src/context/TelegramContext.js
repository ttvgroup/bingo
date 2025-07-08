// frontend/src/context/TelegramContext.js
import React, { createContext, useState, useEffect } from 'react';
import TelegramSDK from '@twa-dev/sdk';

export const TelegramContext = createContext();

export const TelegramProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    TelegramSDK.ready();
    setUser(TelegramSDK.initDataUnsafe?.user || null);
  }, []);

  return (
    <TelegramContext.Provider value={{ user }}>
      {children}
    </TelegramContext.Provider>
  );
};
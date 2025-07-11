// frontend/src/hooks/useApi.js
import { useState, useCallback } from 'react';
import axios from 'axios';

const useApi = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchUser = useCallback(async (telegramId) => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/users/${telegramId}`);
      return response.data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { fetchUser, loading, error };
};

export default useApi;
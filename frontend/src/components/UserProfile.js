// frontend/src/components/UserProfile.js
import React from 'react';

const UserProfile = ({ user }) => {
  return (
    <div className="user-profile">
      <h2>{user.username}</h2>
      <p>ID: {user.telegramId}</p>
    </div>
  );
};

export default UserProfile;
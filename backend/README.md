Telegram Lottery Mini-App Backend Index
This document serves as an index for all backend source code files of the Telegram Lottery Mini-App, built with a modular MVC structure, using Express, MongoDB, Redis, and Telegram Bot API. The backend supports user authentication, role-based access (admin, user, affiliate), betting logic, result processing, and notifications.
Directory Structure
backend/
├── config/
│   └── redis.js
│   └── index.js
├── controllers/
│   ├── betController.js
│   ├── resultController.js
│   ├── statsController.js
│   ├── transactionController.js
│   ├── adminController.js
│   ├── userController.js
├── models/
│   ├── User.js
│   ├── Bet.js
│   ├── Result.js
│   ├── Transaction.js
├── routes/
│   └── api.js
├── middleware/
│   ├── auth.js
│   ├── roleAuth.js
├── services/
│   ├── telegramService.js
│   ├── lotteryService.js
├── utils/
│   ├── error.js
│   ├── helpers.js
└── server.js

File Index



Artifact ID
Title
Content Type
Description



a6403b5a-8a43-4bd4-a83d-6475756cfbf2
config/redis.js
text/javascript
Singleton Redis client configuration with retry strategy.


da24b973-9583-4b46-b8ce-890f2e010c11
models/User.js
text/javascript
User model with fields for telegramId, role, affiliateCode, referredBy, and indexes for performance.


67541365-f8c1-4f22-84d5-9edbb3f6a624
models/Bet.js
text/javascript
Bet model with fields for userId, numbers, betType, amount, and indexes.


ea00d8e4-7aa2-4bd6-8188-89d8c882287a
controllers/resultController.js
text/javascript
Handles adding and retrieving lottery results, caching in Redis.


31f5e1c8-612e-4724-9ba4-ee23dbe9a72c
controllers/betController.js
text/javascript
Manages bet placement and retrieval, with time-based betting restrictions.


8f609dad-12eb-4ea7-9550-8c03ff9e99cb
controllers/statsController.js
text/javascript
Provides user, global, and affiliate statistics (bets, wins, referrals).


2c44a600-ca01-4e26-8a03-e4ebfaa8ed9c
controllers/adminController.js
text/javascript
Admin functions for managing results, transactions, and assigning roles.


748d5226-b7ff-483e-bb95-7c842d137945
controllers/transactionController.js
text/javascript
Manages user transactions (deposit/withdraw) and approvals.


6667e626-3eac-4c99-8dd9-490fb05e6ef3
controllers/userController.js
text/javascript
Handles user registration with optional affiliate code.


d7067def-cc9b-4e45-9a18-e22e759246be
routes/api.js
text/javascript
Defines API routes with middleware for auth and role restrictions.


090697bd-f788-4758-825a-50fc6ab5f983
middleware/auth.js
text/javascript
Telegram Web Apps authentication with initData validation.


aefb077c-843f-4490-bc54-cd9617c58684
middleware/roleAuth.js
text/javascript
Role-based access control for admin, user, affiliate.


6da1edb4-cfba-4476-a2dd-1b73add49e22
services/lotteryService.js
text/javascript
Processes lottery results, checks bets, and sends Telegram notifications.


67298adc-b252-41c4-b131-133e5acf157b
services/telegramService.js
text/javascript
Sends Telegram messages to users and channels.


6e7f71bd-c528-4541-a4d3-c5a64bf6ceee
utils/error.js
text/javascript
Custom ApiError class for standardized error handling.


-
utils/helpers.js
text/javascript
Utility functions (not modified in recent updates).


-
server.js
text/javascript
Main Express server setup (not modified in recent updates).


How to Access and Manage Code
Accessing Artifacts

All code artifacts are stored in the conversation history with unique artifact_id values.
To retrieve a specific file, reference its artifact_id or title in your query (e.g., "Show me controllers/betController.js").
Use the book icon in the UI to view or manage conversation history.

Managing Artifacts

Delete an artifact: Click the book icon under the relevant message, select the artifact or conversation, and choose to forget it.
Disable memory: Go to Settings > Data Controls and turn off the memory feature.
Export code: Request a ZIP file containing all backend code (see below).

Environment Setup
Ensure the following are configured in .env:
MONGO_URI=mongodb://localhost/telegram-lottery-game
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_CHANNEL_ID=@YourChannelName
PORT=5000
REDIS_URL=redis://localhost:6379

Running the Backend
cd backend
npm install express mongoose node-telegram-bot-api dotenv redis
node server.js

Testing APIs

Register user: POST /api/users/register
Place bet: POST /api/bets (00:00-08:00 UTC)
Get stats: GET /api/stats, GET /api/affiliate/stats
Add result: POST /api/results (admin only)

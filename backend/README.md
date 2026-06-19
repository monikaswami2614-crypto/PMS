# Project Management System - Backend API

Backend API for the Project Management System built with Node.js, Express, and MongoDB.

## Features

- User Authentication (JWT)
- Project Management
- Task Management
- Team Collaboration
- RESTful API

## Prerequisites

- Node.js 18+
- MongoDB
- npm or yarn

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file from `.env.example`:
```bash
cp .env.example .env
```

3. Update `.env` with your configuration:
   - `MONGODB_URI`: Your MongoDB connection string
   - `JWT_SECRET`: A secure secret key for JWT
   - Other environment variables as needed

## Development

Start the development server:
```bash
npm run dev
```

The server will start on `http://localhost:5000` (or the port specified in `.env`)

## Building

Build the TypeScript project:
```bash
npm run build
```

## Production

Start the production server:
```bash
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/refresh` - Refresh JWT token

### Projects
- `GET /api/projects` - Get all projects
- `POST /api/projects` - Create a new project
- `GET /api/projects/:id` - Get project details
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Tasks
- `GET /api/tasks` - Get all tasks
- `POST /api/tasks` - Create a new task
- `GET /api/tasks/:id` - Get task details
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

### Users
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user details
- `PUT /api/users/:id` - Update user profile

## Project Structure

```
src/
├── config/          # Configuration files (database, JWT, etc.)
├── controllers/     # Route controllers/handlers
├── middleware/      # Custom middleware
├── models/         # MongoDB schemas and models
├── routes/         # API route definitions
└── index.ts        # Application entry point
```

## Error Handling

The API returns appropriate HTTP status codes and error messages:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

## License

MIT

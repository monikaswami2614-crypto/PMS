# Project Management System - Backend API

Backend API for the Project Management System, built with Node.js, Express,
TypeScript, PostgreSQL, and Prisma ORM.

## Features

- User authentication with JWT
- Project and task management
- Team collaboration
- Project checklists and file validation
- Notifications, activity logs, and email support
- RESTful API

## Prerequisites

- Node.js 18 or newer
- PostgreSQL
- npm

## Installation

1. Install the dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file from the provided example:

   ```bash
   cp .env.example .env
   ```

   On Windows PowerShell, use:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Create a PostgreSQL database and set `DATABASE_URL` in `.env`:

   ```env
   DATABASE_URL=postgresql://postgres:your_password@localhost:5432/project_management_system?schema=public
   ```

   Replace the username, password, host, port, and database name when your
   PostgreSQL configuration is different.

4. Generate the Prisma Client:

   ```bash
   npm run prisma:generate
   ```

5. Apply the checked-in database migrations:

   ```bash
   npx prisma migrate deploy
   ```

   This creates or updates the PostgreSQL tables without replacing existing
   data.

## Development

Start the development server:

```bash
npm run dev
```

The server starts at `http://localhost:5000` by default. Verify it with:

```text
GET http://localhost:5000/health
```

## Prisma workflow

The database schema is defined in `prisma/schema.prisma`.

After intentionally changing that schema during development, create and apply a
new migration:

```bash
npm run prisma:migrate -- --name describe_your_change
```

Regenerate Prisma Client after schema changes:

```bash
npm run prisma:generate
```

To inspect the database with Prisma Studio:

```bash
npx prisma studio
```

Commit new migration files in `prisma/migrations/` along with schema changes.
The application connects to PostgreSQL through the `DATABASE_URL` environment
variable.

## Building and production

Build the TypeScript project:

```bash
npm run build
```

Apply production migrations and start the compiled server:

```bash
npx prisma migrate deploy
npm start
```

## Main API endpoints

### Authentication

- `POST /api/auth/register` - Register a user
- `POST /api/auth/login` - Log in
- `POST /api/auth/logout` - Log out
- `POST /api/auth/refresh` - Refresh a JWT

### Projects

- `GET /api/projects` - Get all projects
- `POST /api/projects` - Create a project
- `GET /api/projects/:id` - Get a project
- `PUT /api/projects/:id` - Update a project
- `DELETE /api/projects/:id` - Delete a project

### Tasks

- `GET /api/tasks` - Get all tasks
- `POST /api/tasks` - Create a task
- `GET /api/tasks/:id` - Get a task
- `PUT /api/tasks/:id` - Update a task
- `DELETE /api/tasks/:id` - Delete a task

### Users

- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get a user
- `PUT /api/users/:id` - Update a user

## Project structure

```text
backend/
|-- prisma/
|   |-- migrations/       # PostgreSQL migration history
|   `-- schema.prisma     # Prisma models and PostgreSQL datasource
|-- src/
|   |-- config/           # Prisma client, database, and app configuration
|   |-- controllers/      # Route handlers
|   |-- jobs/             # Scheduled jobs
|   |-- middleware/       # Authentication and error handling
|   |-- models/           # TypeScript domain interfaces
|   |-- routes/           # API route definitions
|   |-- services/         # Application services
|   |-- utils/            # Shared utilities
|   `-- index.ts          # Application entry point
|-- .env.example
|-- package.json
`-- tsconfig.json
```

## Error handling

The API returns standard HTTP status codes:

- `200` - Success
- `201` - Created
- `400` - Bad request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not found
- `500` - Internal server error

## License

MIT

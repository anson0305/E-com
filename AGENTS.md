# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

**重要：請一律用粵語（廣東話）回覆我，包括所有解釋、說明、程式碼註釋、同埋對話。唔理新 session 定舊 session 都一樣。**

## Overview

E-commerce backend API — Express 5 + TypeScript 7 + PostgreSQL. Three modules implemented: **users/auth**, **products**, and **categories**. Layered architecture with controllers, services, and repositories.

## Commands

```bash
# Run the server in dev mode (hot reload via tsx watch)
npx tsx watch src/server.ts

# Type-check without emitting
npx tsc --project tsconfigs.json --noEmit

# Compile to dist/
npx tsc --project tsconfigs.json

# Run all tests
npx vitest run

# Run tests in watch mode
npx vitest

# Run a subset of tests
npx vitest run tests/unit
npx vitest run tests/integration

# Seed an admin user (defaults: admin@example.com / admin123)
npx tsx scripts/seed-admin.ts
npx tsx scripts/seed-admin.ts "me@example.com" "mypassword" "MyName"
```

Note: The tsconfig file is named `tsconfigs.json` (non-standard — it has an extra "s").

## Architecture

```
src/
  server.ts              Entry point — calls app.listen(3000)
  app.ts                 Express app: cors → json → cookieParser → logger → /users, /products, /categories
  config/db.ts           PostgreSQL pool singleton (reads DB_HOST/PORT/NAME/USER/PASSWORD from env)
  types/express.d.ts     Global augmentation for req.jwtPayload
  models/
    users.ts             User, CreateUserInput, UserResponse
    products.ts          Product, CreateProductInput, UpdateProductInput, ProductResponse
    categories.ts        Category, CreateCategoryInput, CategoryResponse
  repositories/
    userRepository.ts    findByEmail, create, findAll, findById, deleteById, updateById
    productRepository.ts findall, findByID, findByCategoryId, findByName, create, deleteById, update
    categoryRepository.ts findAll, findById, findByParent, findByName, create
  services/
    JWT.ts               bcrypt hash/verify + JWT sign/verify (access + refresh tokens)
    userServices.ts      UserService: register, login, profile, listAllUsers, deleteUser, updateUserRole
    productService.ts    ProductService: CRUD + findByCategory delegation to categoryService
    categoryService.ts   CategoryService: listAll, getById, getByName, getByParent, create
  controllers/
    userController.ts    register, login, profile, refresh, listUsers, removeUser, changeRole
    productController.ts findAllProduct, searchProduct, createProduct, updateProduct, deleteProduct
    categoryController.ts listCategories, getCategory, createCategory
  middleware/
    auth.ts              JWT_auth — Bearer token verification, attaches decoded payload to req.jwtPayload
    authorize.ts         authorize(...roles) — factory that returns role-check middleware (403 if mismatch)
  routes/
    users.ts             Public: register, login, refresh. Protected: profile, list, delete, changeRole (admin)
    products.ts          Public: list, search. Protected: create, update, delete (admin)
    categories.ts        Public: list, get. Protected: create (admin)
scripts/
  seed-admin.ts          Creates/promotes admin user via ON CONFLICT DO UPDATE
migrations/              Raw SQL migrations (applied manually or via pg-mem in tests)
  001_users_initial.sql
  002_fix_users_constraints.sql
  003_product_initial.sql
  004_categories.sql
  005_fix_product_category_fk.sql
```

## Key Patterns & Conventions

### Database (PostgreSQL + raw SQL)
- Uses `pg` Pool directly — no ORM, no query builder.
- DB connection reads from env vars: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`. Defaults to `localhost:5432/e_comdb` as user `postgres`.
- Queries use parameterized `$1, $2` syntax — never string interpolation.
- Table schemas span multiple migration files per table — the final shape may differ from any single migration.

### Auth Flow
- Passwords hashed with bcrypt (10 salt rounds).
- On register/login: both an access token (15m expiry) and refresh token (1d expiry) are issued.
- JWT payload shape: `{ userId: string, email: string, role: 'customer' | 'admin' }`.
- Secrets default to hardcoded fallbacks (`'access_secret_key'` / `'refresh_secret_key'`) when `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` env vars are not set — **must be configured in production**.
- Protected routes use `JWT_auth` middleware → `authorize(...roles)` middleware chain.
- Refresh token rotation: login and refresh endpoints set a new `refresh_token` HttpOnly cookie each time.

### Code Style
- Controllers and services use **async/await** throughout.
- Custom error classes (e.g., `DuplicateError`, `UnknownProductID`, `CategoryNotFoundError`) extend `Error` — controllers catch them via `instanceof` to return appropriate status codes.
- Controllers send `{ success: boolean, data, error }` shaped JSON responses.
- Repository constructors accept a pool parameter, services accept repository/other-service parameters for DI — enables clean unit testing with mocks.
- No request validation yet (Zod planned) — controllers destructure `req.body` directly and check required fields manually.

### Testing
- **vitest** for runner + assertions, **supertest** for HTTP integration tests, **pg-mem** for in-memory Postgres.
- Globals enabled (`describe`, `it`, `expect`, `vi`, `beforeEach` available without imports).
- `tests/setup.ts` exports `mockReq(overrides)`, `mockRes()`, `mockNext()` helper factories.
- **Unit tests**: mock the repository layer or services via `vi.mock` + DI; controllers test HTTP status/response shapes.
- **Integration tests**: pg-mem creates in-memory DB with full schema via migration SQL. Mock `src/config/db.js` pool via `vi.mock` before dynamic `await import('../../src/app.js')`. Seed data via direct SQL, mint real JWT tokens with the known secret fallback.
- Test file convention: mirror the source structure under `tests/unit/` and `tests/integration/`.

## TypeScript Gotchas
- `moduleResolution: "NodeNext"` requires explicit `.js` extensions in relative imports — all imports in `src/` use this pattern.
- The `router` package in `dependencies` appears unused — Express 5's built-in `Router` is what the code actually uses.

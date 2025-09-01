# ESLint & Prettier Configuration for Team NestJS Project

## Tổng quan

ESLint và Prettier là những công cụ thiết yếu để maintain code quality và consistency trong team. ESLint giúp detect và fix lỗi code, trong khi Prettier đảm bảo code formatting nhất quán.

## 1. Lý do cần ESLint & Prettier cho Team

### 1.1 Benefits của ESLint

- **Code Quality**: Phát hiện potential bugs và anti-patterns
- **Consistency**: Enforce coding standards across team
- **Maintainability**: Easier to read và maintain code
- **Performance**: Identify performance issues early

### 1.2 Benefits của Prettier

- **Formatting Consistency**: Unified code style cho toàn team
- **Reduced Bike-shedding**: Eliminate debates về formatting
- **Time Saving**: Automatic formatting on save
- **Focus on Logic**: Less time worrying về formatting

## 2. Installation & Setup

### 2.1 Cài đặt các package cần thiết

```bash
# Core packages
npm install --save-dev eslint @eslint/js typescript-eslint eslint-plugin-prettier eslint-config-prettier prettier globals

# NestJS specific
npm install --save-dev @typescript-eslint/eslint-plugin @typescript-eslint/parser

# Additional useful plugins
npm install --save-dev eslint-plugin-import eslint-plugin-unused-imports eslint-plugin-simple-import-sort

# Pre-commit hooks (optional but recommended)
npm install --save-dev husky lint-staged
```

### 2.2 ESLint Configuration

```javascript
// eslint.config.mjs
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'
import prettierPlugin from 'eslint-plugin-prettier'
import importPlugin from 'eslint-plugin-import'
import unusedImports from 'eslint-plugin-unused-imports'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import globals from 'globals'

export default tseslint.config(
  // Base configurations
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  prettierConfig,

  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      ecmaVersion: 2022,
      sourceType: 'module',
    },

    plugins: {
      '@typescript-eslint': tseslint.plugin,
      prettier: prettierPlugin,
      import: importPlugin,
      'unused-imports': unusedImports,
      'simple-import-sort': simpleImportSort,
    },

    rules: {
      // Prettier integration
      'prettier/prettier': 'error',

      // TypeScript specific rules
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'off', // Using unused-imports instead
      '@typescript-eslint/prefer-const': 'error',
      '@typescript-eslint/no-var-requires': 'error',

      // Import/Export rules
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'import/first': 'error',
      'import/newline-after-import': 'error',
      'import/no-duplicates': 'error',
      'import/no-unresolved': 'off', // TypeScript handles this
      'import/order': 'off', // Using simple-import-sort instead

      // Unused imports
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      // General code quality rules
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0 }],
      'no-trailing-spaces': 'error',
      'prefer-const': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',

      // NestJS specific patterns
      'prefer-arrow-callback': 'error',
      'arrow-body-style': ['error', 'as-needed'],
    },

    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.js', '*.mjs', 'jest.config.*', 'prisma/migrations/**'],
  },

  // Specific overrides for test files
  {
    files: ['**/*.spec.ts', '**/*.test.ts', '**/test/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Configuration files
  {
    files: ['*.config.ts', '*.config.js', '*.config.mjs'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
)
```

### 2.3 Prettier Configuration

```json
// .prettierrc
{
  "semi": true,
  "trailingComma": "all",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "bracketSameLine": false,
  "arrowParens": "avoid",
  "endOfLine": "lf",
  "quoteProps": "as-needed",
  "proseWrap": "preserve",
  "htmlWhitespaceSensitivity": "css",
  "embeddedLanguageFormatting": "auto"
}
```

```javascript
// prettier.config.js (alternative)
module.exports = {
  semi: true,
  trailingComma: 'all',
  singleQuote: true,
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: 'avoid',
  endOfLine: 'lf',

  // File-specific overrides
  overrides: [
    {
      files: '*.json',
      options: {
        printWidth: 80,
      },
    },
    {
      files: '*.md',
      options: {
        proseWrap: 'always',
        printWidth: 80,
      },
    },
    {
      files: '*.yml',
      options: {
        tabWidth: 2,
      },
    },
  ],
}
```

### 2.4 Prettier Ignore File

```
# .prettierignore
# Dependencies
node_modules/

# Production builds
dist/
build/

# Generated files
coverage/
*.log
*.pid
*.lock

# Prisma
prisma/migrations/

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Specific files that shouldn't be formatted
package-lock.json
yarn.lock
pnpm-lock.yaml
```

## 3. Advanced Configuration

### 3.1 Custom ESLint Rules cho NestJS

```javascript
// eslint-rules/nestjs-custom.js
const nestjsCustomRules = {
  rules: {
    // Enforce proper decorator usage
    '@typescript-eslint/prefer-readonly': 'error',

    // NestJS module structure
    'class-methods-use-this': 'off',

    // Dependency injection patterns
    '@typescript-eslint/parameter-properties': 'error',

    // DTO validation
    '@typescript-eslint/no-inferrable-types': 'off',

    // Service patterns
    '@typescript-eslint/explicit-member-accessibility': [
      'error',
      {
        accessibility: 'explicit',
        overrides: {
          accessors: 'explicit',
          constructors: 'no-public',
          methods: 'explicit',
          properties: 'off',
          parameterProperties: 'explicit',
        },
      },
    ],
  },
}

export default nestjsCustomRules
```

### 3.2 Custom Import Sorting

```javascript
// Add to eslint.config.mjs
'simple-import-sort/imports': [
  'error',
  {
    groups: [
      // Node.js builtins
      ['^(assert|buffer|child_process|cluster|console|constants|crypto|dgram|dns|domain|events|fs|http|https|module|net|os|path|punycode|querystring|readline|repl|stream|string_decoder|sys|timers|tls|tty|url|util|vm|zlib|freelist|v8|process|async_hooks|http2|perf_hooks)(/.*|$)'],

      // External packages
      ['^@?\\w'],

      // NestJS specific imports
      ['^@nestjs'],

      // Internal packages (adjust based on your structure)
      ['^(@|src)(/.*|$)'],

      // Relative imports
      ['^\\.\\.(?!/?$)', '^\\.\\./?$'],
      ['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$'],

      // Style imports
      ['^.+\\.s?css$'],
    ],
  },
],
```

## 4. VS Code Integration

### 4.1 VS Code Settings

```json
// .vscode/settings.json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.formatOnPaste": true,
  "editor.formatOnType": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit",
    "source.organizeImports": "explicit"
  },
  "eslint.validate": ["javascript", "javascriptreact", "typescript", "typescriptreact"],
  "typescript.preferences.organizeImportsCollation": "ordinal",
  "typescript.preferences.organizeImportsCollationLocale": "en",
  "typescript.preferences.organizeImportsNumericCollation": true,
  "files.eol": "\n",
  "files.insertFinalNewline": true,
  "files.trimFinalNewlines": true,
  "files.trimTrailingWhitespace": true
}
```

### 4.2 Recommended Extensions

```json
// .vscode/extensions.json
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next",
    "streetsidesoftware.code-spell-checker"
  ]
}
```

### 4.3 VS Code Tasks

```json
// .vscode/tasks.json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "ESLint: Fix All",
      "type": "shell",
      "command": "npm",
      "args": ["run", "lint:fix"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      }
    },
    {
      "label": "Prettier: Format All",
      "type": "shell",
      "command": "npm",
      "args": ["run", "format"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      }
    }
  ]
}
```

## 5. NPM Scripts

### 5.1 Package.json Scripts

```json
{
  "scripts": {
    "lint": "eslint \"{src,test}/**/*.ts\"",
    "lint:fix": "eslint \"{src,test}/**/*.ts\" --fix",
    "lint:staged": "eslint",
    "format": "prettier --write \"{src,test}/**/*.ts\"",
    "format:check": "prettier --check \"{src,test}/**/*.ts\"",
    "check-all": "npm run lint && npm run format:check",
    "fix-all": "npm run lint:fix && npm run format"
  }
}
```

## 6. Pre-commit Hooks

### 6.1 Husky Setup

```bash
# Initialize husky
npx husky init

# Add pre-commit hook
echo "npx lint-staged" > .husky/pre-commit
```

### 6.2 Lint-staged Configuration

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml,yaml}": ["prettier --write"]
  }
}
```

Hoặc file riêng:

```javascript
// lint-staged.config.js
module.exports = {
  '*.{ts,tsx}': ['eslint --fix', 'prettier --write', 'git add'],
  '*.{json,md,yml,yaml}': ['prettier --write', 'git add'],
  '*.{js,jsx}': ['eslint --fix', 'prettier --write', 'git add'],
}
```

## 7. CI/CD Integration

### 7.1 GitHub Actions

```yaml
# .github/workflows/code-quality.yml
name: Code Quality

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint-and-format:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint
        run: npm run lint

      - name: Check Prettier formatting
        run: npm run format:check

      - name: Type checking
        run: npm run build
```

### 7.2 GitLab CI

```yaml
# .gitlab-ci.yml
code_quality:
  stage: test
  image: node:18-alpine
  before_script:
    - npm ci
  script:
    - npm run lint
    - npm run format:check
    - npm run build
  only:
    - merge_requests
    - main
    - develop
```

## 8. Team Guidelines

### 8.1 Coding Standards

#### Import Organization

```typescript
// ✅ Good: Organized imports
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { DatabaseService } from '../database/database.service'
import { UserEntity } from './entities/user.entity'

// ❌ Bad: Unorganized imports
import { UserEntity } from './entities/user.entity'
import { Injectable } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { ConfigService } from '@nestjs/config'
```

#### Naming Conventions

```typescript
// ✅ Good: Consistent naming
export class UserService {
  private readonly logger = new Logger(UserService.name)

  public async createUser(createUserDto: CreateUserDto): Promise<UserEntity> {
    // Implementation
  }
}

// ❌ Bad: Inconsistent naming
export class userservice {
  private Logger = new Logger('userservice')

  public async CreateUser(createuserdto: any): Promise<any> {
    // Implementation
  }
}
```

#### Method Structure

```typescript
// ✅ Good: Clean method structure
@Injectable()
export class UserService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  public async findUserById(id: string): Promise<UserEntity | null> {
    try {
      return await this.database.user.findUnique({ where: { id } })
    } catch (error) {
      this.logger.error(`Failed to find user ${id}`, error.stack)
      throw new InternalServerErrorException('Failed to retrieve user')
    }
  }
}
```

### 8.2 Error Handling Standards

```typescript
// ✅ Good: Proper error handling
@Injectable()
export class UserService {
  public async createUser(userData: CreateUserDto): Promise<UserEntity> {
    try {
      // Validation
      if (!userData.email) {
        throw new BadRequestException('Email is required')
      }

      // Business logic
      const user = await this.database.user.create({
        data: userData,
      })

      return user
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error
      }

      this.logger.error('Failed to create user', error.stack)
      throw new InternalServerErrorException('User creation failed')
    }
  }
}
```

### 8.3 Documentation Standards

````typescript
/**
 * Service responsible for user management operations
 *
 * @example
 * ```typescript
 * const userService = new UserService(database, config);
 * const user = await userService.createUser(userData);
 * ```
 */
@Injectable()
export class UserService {
  /**
   * Creates a new user in the system
   *
   * @param userData - The user data to create
   * @returns Promise resolving to the created user entity
   * @throws BadRequestException when validation fails
   * @throws InternalServerErrorException when database operation fails
   */
  public async createUser(userData: CreateUserDto): Promise<UserEntity> {
    // Implementation
  }
}
````

## 9. Troubleshooting

### 9.1 Common Issues

**Issue 1: ESLint và Prettier conflicts**

```bash
# Check for conflicts
npm run lint
npm run format:check

# Fix conflicts by updating prettier config in ESLint
```

**Issue 2: Import ordering issues**

```bash
# Auto-fix import ordering
npm run lint:fix

# Or manually adjust simple-import-sort configuration
```

**Issue 3: Performance issues với large codebase**

```javascript
// Add to eslint.config.mjs for better performance
{
  settings: {
    'import/cache': {
      lifetime: 5000
    }
  }
}
```

### 9.2 Debug Commands

```bash
# Check ESLint configuration
npx eslint --print-config src/main.ts

# Check what files ESLint is processing
npx eslint --debug src/

# Test Prettier formatting
npx prettier --check src/main.ts

# Check if files are ignored
npx eslint --print-config .eslintignore
```

## 10. Best Practices Summary

### 10.1 For Team Leads

1. **Enforce consistency** từ ngày đầu
2. **Document exceptions** cho special cases
3. **Regular reviews** của coding standards
4. **Training sessions** cho new team members
5. **Gradual adoption** để không disrupt workflow

### 10.2 For Developers

1. **Run linting** trước khi commit
2. **Fix warnings** ngay khi thấy
3. **Understand rules** thay vì disable blindly
4. **Consistent formatting** across files
5. **Follow team conventions** over personal preferences

### 10.3 For Project Maintenance

1. **Regular updates** của ESLint và Prettier
2. **Review rules** periodically
3. **Performance monitoring** của linting process
4. **Team feedback** incorporation
5. **Documentation updates** khi có changes

## Kết luận

ESLint và Prettier setup cho team NestJS project là investment quan trọng cho:

- **Code Quality**: Consistent, maintainable code
- **Team Productivity**: Less time debating styles
- **Bug Prevention**: Early detection của potential issues
- **Onboarding**: Easier cho new team members
- **Professional Standards**: Industry-standard practices

Việc follow comprehensive setup này sẽ giúp team maintain high code quality standards và work more effectively together.

## 2. Cấu hình ESLint (Flat Config)

- Sử dụng file `eslint.config.mjs` (đã có sẵn trong dự án):
- Đã tích hợp sẵn các preset cho TypeScript, Prettier, Jest, Node.
- Không cần tạo `.eslintrc.js`.

## 3. Cấu hình Prettier

- Sử dụng file `.prettierrc` ở thư mục gốc, ví dụ:

```
{
  "singleQuote": true,         // Dùng dấu nháy đơn thay vì nháy kép cho chuỗi
  "trailingComma": "all",     // Thêm dấu phẩy ở cuối cho tất cả các phần tử (object, array, v.v.)
  "semi": false,               // Không dùng dấu chấm phẩy ở cuối dòng
  "arrowParens": "always",   // Luôn dùng dấu ngoặc cho tham số arrow function, ví dụ: (x) => x
  "tabWidth": 2,               // Số khoảng trắng cho mỗi tab là 2
  "endOfLine": "auto",        // Kết thúc dòng tự động theo hệ điều hành
  "useTabs": false,            // Dùng khoảng trắng thay vì tab để thụt lề
  "printWidth": 120            // Giới hạn chiều dài tối đa của một dòng là 120 ký tự
}
```

**Giải thích từng option:**

- `singleQuote`: Dùng dấu nháy đơn cho chuỗi thay vì nháy kép.
- `trailingComma`: Thêm dấu phẩy ở cuối phần tử (object, array, v.v.) giúp diff git dễ đọc hơn.
- `semi`: Không dùng dấu chấm phẩy ở cuối dòng.
- `arrowParens`: Luôn dùng dấu ngoặc cho tham số arrow function, giúp code nhất quán.
- `tabWidth`: Số khoảng trắng cho mỗi tab (thụt lề).
- `endOfLine`: Tự động chọn kiểu kết thúc dòng phù hợp với hệ điều hành.
- `useTabs`: Dùng khoảng trắng thay vì tab để thụt lề.
- `printWidth`: Giới hạn chiều dài tối đa của một dòng code, giúp code dễ đọc hơn.

## 4. Thêm script vào package.json

Thêm vào phần `scripts`:

```
"lint": "eslint \"src/**/*.{js,ts}\"",
"format": "prettier --write \"src/**/*.{js,ts,json,md}\""
```

## 5. (Tùy chọn) Ignore các thư mục không cần kiểm tra

Tạo file `.eslintignore` và `.prettierignore` với nội dung:

```
node_modules
dist
```

## 6. Sử dụng

- Kiểm tra code: `npm run lint`
- Format code: `npm run format`
- Tự động fix lỗi ESLint: `npx eslint src --fix`

## 7. Lưu ý

- Cấu hình Prettier chỉ nên để trong `.prettierrc`, không lặp lại trong rule ESLint.
- Nếu dùng Flat Config (`eslint.config.mjs`), không cần `.eslintrc.js`.
- Có thể mở rộng rule trong `eslint.config.mjs` theo nhu cầu dự án.

---

Nếu gặp lỗi liên quan đến TypeScript hoặc Prettier, hãy kiểm tra lại version các package và cấu trúc file cấu hình.

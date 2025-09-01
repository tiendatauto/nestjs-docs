# ESLint & Prettier Setup for Team NestJS Project

## Tổng quan

ESLint và Prettier là tools thiết yếu để maintain code quality và consistency trong team. ESLint detect bugs và enforce coding standards, Prettier đảm bảo consistent formatting.

## 1. Lý do cần ESLint & Prettier

### 1.1 Benefits của ESLint

- **Code Quality**: Phát hiện potential bugs và anti-patterns
- **Consistency**: Enforce coding standards across team
- **Maintainability**: Code dễ đọc và maintain
- **Performance**: Identify performance issues sớm

### 1.2 Benefits của Prettier

- **Formatting Consistency**: Unified code style cho team
- **Reduced Bike-shedding**: Eliminate debates về formatting
- **Time Saving**: Automatic formatting on save
- **Focus on Logic**: Ít thời gian worry về formatting

## 2. Installation & Setup

### 2.1 Core Dependencies

```bash
# Core packages
npm install --save-dev eslint @eslint/js typescript-eslint eslint-plugin-prettier eslint-config-prettier prettier globals

# NestJS specific
npm install --save-dev @typescript-eslint/eslint-plugin @typescript-eslint/parser

# Additional useful plugins
npm install --save-dev eslint-plugin-import eslint-plugin-unused-imports eslint-plugin-simple-import-sort

# Pre-commit hooks (recommended)
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

  // Test files override
  {
    files: ['**/*.spec.ts', '**/*.test.ts', '**/test/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
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
  "proseWrap": "preserve"
}
```

### 2.4 Prettier Ignore

```
# .prettierignore
node_modules/
dist/
build/
coverage/
*.log
*.pid
*.lock
prisma/migrations/
.vscode/
.idea/
.DS_Store
package-lock.json
yarn.lock
pnpm-lock.yaml
```

## 3. VS Code Integration

### 3.1 VS Code Settings

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
  "files.eol": "\n",
  "files.insertFinalNewline": true,
  "files.trimFinalNewlines": true,
  "files.trimTrailingWhitespace": true
}
```

### 3.2 Recommended Extensions

```json
// .vscode/extensions.json
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-typescript-next",
    "streetsidesoftware.code-spell-checker"
  ]
}
```

### 3.3 VS Code Tasks

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
      "group": "build"
    },
    {
      "label": "Prettier: Format All",
      "type": "shell",
      "command": "npm",
      "args": ["run", "format"],
      "group": "build"
    }
  ]
}
```

## 4. NPM Scripts

### 4.1 Package.json Scripts

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

## 5. Pre-commit Hooks

### 5.1 Husky Setup

```bash
# Initialize husky
npx husky init

# Add pre-commit hook
echo "npx lint-staged" > .husky/pre-commit
```

### 5.2 Lint-staged Configuration

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml,yaml}": ["prettier --write"]
  }
}
```

## 6. Advanced Configuration

### 6.1 Custom Import Sorting

```javascript
// Add to eslint.config.mjs rules
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

      // Internal packages
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

### 6.2 NestJS Specific Rules

```javascript
// Custom rules for NestJS patterns
const nestjsRules = {
  // Enforce proper decorator usage
  '@typescript-eslint/prefer-readonly': 'error',

  // Service patterns
  'class-methods-use-this': 'off',

  // Dependency injection
  '@typescript-eslint/parameter-properties': 'error',

  // DTO validation
  '@typescript-eslint/no-inferrable-types': 'off',

  // Explicit member accessibility
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
}
```

## 7. Team Coding Standards

### 7.1 Import Organization

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
```

### 7.2 Naming Conventions

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

### 7.3 Method Structure

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

## 8. CI/CD Integration

### 8.1 GitHub Actions

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

## 9. Troubleshooting

### 9.1 Common Issues

**Issue 1: ESLint và Prettier conflicts**

```bash
# Check for conflicts
npm run lint
npm run format:check

# Fix by updating prettier config in ESLint
```

**Issue 2: Import ordering issues**

```bash
# Auto-fix import ordering
npm run lint:fix

# Manually adjust simple-import-sort config
```

**Issue 3: Performance với large codebase**

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

# Check processed files
npx eslint --debug src/

# Test Prettier formatting
npx prettier --check src/main.ts
```

## 10. Best Practices

### 10.1 For Team Leads

1. **Enforce consistency** từ ngày đầu
2. **Document exceptions** cho special cases
3. **Regular reviews** của coding standards
4. **Training sessions** cho new members
5. **Gradual adoption** để không disrupt workflow

### 10.2 For Developers

1. **Run linting** trước khi commit
2. **Fix warnings** ngay khi thấy
3. **Understand rules** thay vì disable blindly
4. **Consistent formatting** across files
5. **Follow team conventions**

### 10.3 Maintenance

1. **Regular updates** của ESLint và Prettier
2. **Review rules** periodically
3. **Monitor performance** của linting process
4. **Incorporate team feedback**
5. **Update documentation** khi có changes

## Kết luận

ESLint và Prettier setup cho team NestJS project là investment quan trọng cho:

- **Code Quality**: Consistent, maintainable code
- **Team Productivity**: Less time debating styles
- **Bug Prevention**: Early detection của issues
- **Onboarding**: Easier cho new team members
- **Professional Standards**: Industry-standard practices

Follow comprehensive setup này sẽ giúp team maintain high code quality và work effectively together!

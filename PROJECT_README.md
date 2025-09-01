# React Study Project

Một project ReactJS với Vite + TypeScript + TailwindCSS để học tập và thực hành.

## 🚀 Tính năng

- **Sidebar Navigation**: Hiển thị danh sách file markdown từ thư mục `public/docs`
- **Markdown Viewer**: Hiển thị nội dung markdown với syntax highlighting
- **React Router**: Routing với URL pattern `/docs/:filename`
- **Component Architecture**: Tách biệt rõ ràng các component (Sidebar, MarkdownViewer, AppLayout)
- **TypeScript**: Type safety hoàn toàn
- **TailwindCSS**: Styling hiện đại và responsive

## 📁 Cấu trúc thư mục

```
react-study/
├── public/
│   └── docs/                    # Thư mục chứa file markdown
│       ├── react-introduction.md
│       ├── typescript-react.md
│       ├── tailwindcss-guide.md
│       └── vite-guide.md
├── src/
│   ├── components/              # React components
│   │   ├── AppLayout.tsx       # Layout chính
│   │   ├── Sidebar.tsx         # Sidebar navigation
│   │   └── MarkdownViewer.tsx  # Hiển thị markdown
│   ├── hooks/                  # Custom hooks
│   │   └── useMarkdownFiles.ts # Hook quản lý danh sách files
│   ├── types/                  # TypeScript types
│   │   └── index.ts           # Type definitions
│   ├── App.tsx                # App component chính
│   ├── App.css                # Custom styles
│   ├── index.css              # Global styles
│   └── main.tsx               # Entry point
├── package.json
├── tailwind.config.js         # TailwindCSS config
├── postcss.config.js          # PostCSS config
├── vite.config.ts             # Vite config
└── tsconfig.json              # TypeScript config
```

## 🛠️ Công nghệ sử dụng

- **React 18** - UI Library
- **TypeScript** - Type safety
- **Vite** - Build tool và dev server
- **TailwindCSS** - CSS framework
- **Mantine UI** - Modern React components library
- **React Router DOM** - Client-side routing
- **React Markdown** - Markdown rendering
- **Rehype Highlight** - Syntax highlighting
- **Tabler Icons** - Beautiful icons

## 📦 Scripts

```bash
# Chạy development server
npm run dev

# Build production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

## 🎯 Cách sử dụng

1. **Thêm file markdown mới**:

   - Đặt file `.md` vào thư mục `public/docs/`
   - Cập nhật danh sách trong `src/hooks/useMarkdownFiles.ts`

2. **Truy cập qua URL**:

   - Trang chủ: `http://localhost:5173/`
   - File cụ thể: `http://localhost:5173/docs/filename`

3. **Tùy chỉnh styling**:
   - Global styles: `src/index.css`
   - Component styles: `src/App.css`
   - TailwindCSS: `tailwind.config.js`

## 📝 Components

### AppLayout

Layout chính của ứng dụng, chứa Sidebar và main content area.

### Sidebar

- Hiển thị danh sách file markdown
- Highlight file đang active
- Navigation với React Router

### MarkdownViewer

- Load và hiển thị nội dung markdown
- Syntax highlighting cho code blocks
- Error handling và loading states
- Responsive design

### useMarkdownFiles Hook

- Quản lý danh sách file markdown
- Loading state management
- Type-safe file information

## 🎨 Styling

Project sử dụng TailwindCSS cho responsive design và custom CSS cho markdown styling. Các class CSS được viết để tương thích với prose typography.

## 🔧 Development

Để bắt đầu phát triển:

1. Clone project
2. Chạy `npm install`
3. Chạy `npm run dev`
4. Mở http://localhost:5173

Project đã được cấu hình sẵn với ESLint, TypeScript strict mode, và PostCSS cho TailwindCSS.

---

**Happy Learning! 📚**

# 🦆 Quack API

A desktop API client built with [Tauri](https://tauri.app/) + [Next.js](https://nextjs.org/) + [React](https://react.dev/). Think Postman, but open-source and native.

## Features

### ✅ Implemented

- **HTTP Requests** — GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS with headers, query params, and multiple body types (JSON, text, form-data, x-www-form-urlencoded)
- **WebSocket Support** — Connect, send/receive messages (text & binary), connection status indicators
- **Authentication** — Bearer Token, Basic Auth, and API Key (header or query param)
- **Collections** — Create, organize, and manage collections with folders, drag-and-drop, and YAML-based storage
- **Environment Variables** — Multiple `.env` files per workspace, `{{variable}}` substitution with color-coded status indicators
- **Request History** — Automatically recorded request history with method, URL, status, timing, and clear functionality
- **Response Viewer** — Pretty-printed JSON/XML with syntax highlighting, raw view, headers tab, status codes, timing, and size metrics
- **Workspace Management** — Open folders as workspaces, recent folders, pinned workspaces with emoji support
- **Tabbed Interface** — Multiple request/environment/document tabs with close and reorder
- **Request Settings** — SSL verification toggle and proxy URL support
- **Request Cancellation** — Cancel in-flight requests
- **Collection Docs** — Markdown-based collection descriptions and folder README files

### 🚧 Planned

- **Pre-request Scripts** — Execute scripts before sending requests
- **Test Scripts** — Write and run tests against responses
- **Code Generation** — Generate request code snippets in various languages
- **Request Import/Export** — Import from Postman, cURL, OpenAPI
- **Response History** — View past responses for the same request
- **Cookie Management** — Automatic cookie jar handling
- **GraphQL Support** — Schema-aware GraphQL editor
- **gRPC Support** — Protocol buffer-based RPC calls

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop Framework | [Tauri 2](https://tauri.app/) (Rust) |
| Frontend | [Next.js 16](https://nextjs.org/) + [React 19](https://react.dev/) |
| Language | TypeScript (frontend) + Rust (backend) |
| Styling | [Tailwind CSS 4](https://tailwindcss.com/) |
| UI Components | [shadcn/ui](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/) |
| Icons | [Phosphor Icons](https://phosphoricons.com/) + [Lucide](https://lucide.dev/) |
| HTTP Client | [reqwest](https://docs.rs/reqwest/) (Rust, with TLS/gzip/brotli/SOCKS) |
| WebSocket | [tokio-tungstenite](https://docs.rs/tokio-tungstenite/) |
| Storage | [Tauri Store Plugin](https://v2.tauri.app/plugin/store/) + filesystem |
| Drag & Drop | [dnd-kit](https://dndkit.com/) |
| Package Manager | [Bun](https://bun.sh/) |

## Getting Started

### Prerequisites

- [Node.js 22+](https://nodejs.org/)
- [Bun](https://bun.sh/)
- [Rust](https://www.rust-lang.org/tools/install)
- [Tauri CLI prerequisites](https://v2.tauri.app/start/prerequisites/)

### Development

```bash
# Install dependencies
bun install

# Run in development mode (launches Tauri + Next.js)
bun run dev

# Or run just the Next.js frontend
bun run dev:next
```

### Building

```bash
# Build the desktop application
bun run build

# Build just the Next.js frontend
bun run build:next
```

## Project Structure

```
quackAPI/
├── src/                          # Frontend (Next.js/React)
│   ├── app/                      # Next.js app router (pages & layout)
│   ├── components/
│   │   ├── sidebar/              # App sidebar navigation
│   │   ├── ui/                   # Base UI components (button, scroll-area, etc.)
│   │   └── workspace/            # Main workspace components
│   ├── context/                  # React context (WorkspaceProvider)
│   ├── lib/                      # Utilities & Tauri API wrappers
│   │   ├── collections.ts        # Collection CRUD operations
│   │   ├── environments.ts       # Environment variable management
│   │   ├── http.ts               # HTTP request execution
│   │   ├── websocket.ts          # WebSocket connections
│   │   ├── settings.ts           # App settings & persistence
│   │   ├── types.ts              # Shared TypeScript types
│   │   └── utils.ts              # Utility functions
│   └── styles/                   # Global CSS (Tailwind)
├── src-tauri/                    # Desktop backend (Rust)
│   ├── src/
│   │   ├── lib.rs                # Tauri commands & app setup
│   │   └── main.rs               # Entry point
│   ├── tauri.conf.json           # Tauri configuration
│   └── Cargo.toml                # Rust dependencies
├── package.json
├── tsconfig.json
└── next.config.ts
```

## License

This project is open source.

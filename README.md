# 🍕 ChronoPizza

A visual PizzaSQL Write-Ahead Log (WAL) explorer that lets you travel through time and see how your database evolved, operation by operation.

**🌐 [Try it live](https://chrono.app.pizzaria.foundation)**

## Features

- **📊 Timeline Navigation** - Scrub through every operation in your database's history
- **🗂️ Table Explorer** - View tables, schemas, indexes, and relationships at any point in time
- **🔍 Smart Search** - Find tables, columns, and data across your entire database
- **🕸️ Relations Graph** - Visualize foreign key relationships between tables
- **📤 Export** - Export tables as JSON, SQL, or CSV at any timeline position
- **🎨 Theme Toggle** - Switch between light and dark modes

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (or Node.js/npm)
- A PizzaSQL database file with WAL enabled

### Installation

```bash
# Clone the repository
git clone git@github.com:danfragoso/chronopizza.git
cd chronopizza

# Install dependencies
bun install

# Start development server
bun run dev
```

Visit `http://localhost:5173` to see the app.

## Usage

1. **Upload a Database** - Click "Choose a .db file" or drag & drop your PizzaSQL database
2. **Navigate the Timeline** - Use the timeline slider to move through database operations
3. **Explore Tables** - Click on any table card to view its schema and data
4. **Search** - Press `Cmd/Ctrl + K` to search across tables and columns
5. **View Relations** - Click the graph icon to see table relationships
6. **Export Data** - Use the export button to download table data in your preferred format

## Building for Production

```bash
# Build the app
bun run build

# Preview the production build (runs on port 4173)
bun run preview
```

The built files will be in the `dist/` directory, ready to deploy to any static hosting service.

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS 4** - Styling
- **Lucide React** - Icons
- **Radix UI** - Accessible components
- **Web Workers** - WAL parsing in background thread

## How It Works

ChronoPizza parses your PizzaSQL database's Write-Ahead Log (WAL) file to reconstruct every operation that modified your database. It then allows you to "scrub" through time, showing you the exact state of your database after each operation was applied.

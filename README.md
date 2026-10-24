# 🌱 Food Delivery Carbon Footprint Tracker

A full-stack, scientifically benchmarked web application to estimate, track, and reduce greenhouse gas (GHG) emissions from food delivery orders. Built with an interactive Leaflet/OpenStreetMap frontend, Node.js/Express backend, SQLite database, and real-world road routing via OSRM.

---

## 🌟 Key Features

- **Real-World Route Calculation**:
  - OpenStreetMap Nominatim geocoding with intelligent caching.
  - OSRM (Open Source Routing Machine) for accurate road network distances.
  - Interactive Leaflet map with animated delivery paths and pickup/dropoff markers.

- **Scientific Carbon Emission Engine**:
  - Based on official **UK DESNZ / Defra 2024 GHG Conversion Factors** and **European Life Cycle Assessment (LCA)** studies.
  - Granular emissions breakdown between **delivery transport** (Motorcycle, Car, EV, Bicycle/Walk) and **packaging choices** (Plastic takeout, Kraft paper/cardboard, Reusable deposit containers).
  - Life-cycle boundary documentation (Well-to-Wheel, Cradle-to-Grave).

- **Actionable Insights & Green Swaps**:
  - Real-time impact status badges (Low, Moderate, High impact).
  - Intelligent swap suggestions highlighting potential emissions savings.
  - Equivalency metrics (e.g., equivalent car km, smartphone charges, electric kettle minutes).

- **Order History & Analytics**:
  - SQLite persistent storage with WAL mode.
  - Filterable order history with instant recalculation and server-side verification.
  - Order export (JSON/CSV) and summary statistics.

---

## 🏗️ Architecture & Tech Stack

- **Backend**: Node.js & Express 5
- **Database**: SQLite3 (`better-sqlite3` / `sqlite3`) with WAL journal mode
- **Frontend**: Semantic HTML5, Vanilla Modern CSS (Glassmorphism & CSS custom properties), Vanilla JavaScript (ES6+)
- **Mapping & Routing**: Leaflet.js, OpenStreetMap, OSRM API, Nominatim Geocoding
- **Security & Reliability**: `express-rate-limit`, input validation middleware, centralized error handling

---

## 🚀 Quick Start

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm` (comes with Node.js)

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/jayashreetk55-wq/carbon_footprinting.git
cd carbon_footprinting
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(Default settings use free, open-access OpenStreetMap and OSRM services; no API keys required).*

### 4. Run the Application
Start the server:
```bash
npm start
```
Or run with file watching in development:
```bash
npm run dev
```

Open your browser and navigate to:
```
http://localhost:3000
```

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health status and database connectivity |
| `GET` | `/api/emission-factors` | Official documented emission factors & references |
| `POST` | `/api/route` | Geocode addresses and compute OSRM driving route |
| `POST` | `/api/calculate` | Compute carbon emissions, equivalencies, and swaps |
| `GET` | `/api/orders` | Retrieve list of saved delivery orders |
| `POST` | `/api/orders` | Save a new delivery order to SQLite |
| `DELETE` | `/api/orders/:id` | Delete a saved order |

---

## 📄 License
This project is licensed under the MIT License.

# AuraID — Digital Student Credential Studio

A full-stack web application for creating and managing digital student ID credentials. Features a React/Vite frontend, a Node.js backend, an admin dashboard for credential management, and Netlify deployment.

![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=flat&logo=node.js&logoColor=white)
![Netlify](https://img.shields.io/badge/Netlify-00C7B7?style=flat&logo=netlify&logoColor=white)

---

## 📌 Overview

AuraID is a digital student identity credential studio. Students can fill in their details and generate a styled digital ID card. An admin dashboard provides a secure overview of all created credentials.

The project follows a **frontend + backend split architecture**:
- The **frontend** (React + Vite) handles the credential creation form, ID card display, and navigation.
- The **backend** (Node.js) handles data persistence, photo uploads, and admin authentication.

---

## ✨ Features

- Digital ID credential creation with photo upload
- Styled credential card display
- Admin dashboard — view count of generated IDs and stored credential data
- Secure admin access via environment variable password (configurable)
- JSON-based data storage for credential records
- Netlify deployment with backend via Netlify Functions

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, Vite, JavaScript |
| Backend | Node.js (`server.mjs`) |
| Deployment | Netlify |
| Data Storage | JSON files (`data/ids.json`) |
| Build Tool | Vite |
| Package Manager | npm |

---

## 📁 Project Structure

```
AuraID-Adv/
├── src/                  # React frontend source
├── server/               # Node.js backend
│   └── server.mjs        # Backend entry point
├── netlify/              # Netlify Functions
├── data/                 # Credential data (git-ignored in production)
│   ├── ids.json          # Stored credential records
│   └── photos/           # Uploaded credential photos
├── scripts/              # Development helper scripts
├── index.html            # App shell
├── vite.config.js        # Vite configuration
├── netlify.toml          # Netlify deployment config
├── .env.example          # Environment variable template
├── .gitignore
└── package.json
```

---

## 🚀 Local Setup

**1. Clone the repository**
```bash
git clone https://github.com/MubarakSyed09/AuraID-Adv.git
cd AuraID-Adv
```

**2. Install dependencies**
```bash
npm install
```

**3. Configure environment variables**

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Set your own `ADMIN_PASSWORD` in `.env`.

**4. Start development (frontend + backend)**
```bash
npm run dev:full
```

Open the Vite URL shown in the terminal (typically `http://localhost:5173`).

---

## ⚙️ Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend only (Vite) |
| `npm run dev:full` | Start frontend and backend together |
| `npm run build` | Build frontend for production |
| `npm start` | Start backend server only |

---

## 🔒 Admin Access

Click **Admin** in the navigation bar to open the admin dashboard.

Set the `ADMIN_PASSWORD` environment variable in your `.env` file for a custom password. See `.env.example` for the required format.

---

## 🌐 Deployment

This project is configured for Netlify deployment. See `README-NETLIFY.md` for detailed Netlify-specific setup instructions.

---

## 🚧 Future Improvements

- QR code generation for each credential
- PDF export of the ID card
- Persistent database backend (replacing JSON storage)
- Student portal with login and credential history

---

## 👤 Author

**Mubarak Sayyad** — [GitHub](https://github.com/MubarakSyed09)

3rd Year B.Tech CSE student, VFSTR.

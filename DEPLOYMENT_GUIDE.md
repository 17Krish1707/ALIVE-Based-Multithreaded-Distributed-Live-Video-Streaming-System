# Deployment Guide: Vercel vs Render / Railway for Live Video Streaming

This guide explains why Vercel Serverless Function deployments experience payload and video streaming limitations, and how to deploy this project for **free** on a full Node.js application server platform like **Render** or **Railway**.

---

## 1. Why Vercel Deployment Experiences Issues

| Feature / Requirement | Vercel Serverless Functions | Render / Railway / Full Node.js Server |
| :--- | :--- | :--- |
| **Max HTTP Request Payload** | **Strict 4.5 MB Limit** (Returns `413 Payload Too Large` for files > 4.5 MB) | **Configurable / Unlimited** (Up to 1 GB) |
| **WebSockets (Socket.io)** | **Not Supported** (Serverless functions terminate per request) | **Fully Supported** (Persistent TCP/WebSocket connections) |
| **Node.js `worker_threads`** | **Not Persistent** (Killed when lambda invocation completes) | **Fully Supported** (Real-time concurrent CPU workers) |
| **HTTP 206 Video Streaming** | **Truncated / Timed out** (10-15s lambda timeout limit) | **Full Range Streaming** (Endless video chunk delivery) |
| **Database & Disk Persistence** | **Ephemeral** (Files in `/tmp` disappear between requests) | **Persistent Disk** (SQLite database & uploads preserved) |

---

## 2. Solution Overview

1. **Code Enhancements (Included in Repo)**:
   - Added automatic Vercel 4.5 MB payload limit detection in `public/admin/admin.js`.
   - Added metadata fallback registration if uploading on Vercel.
   - Added fallback video stream routing to `sample_live_video.mp4` in `server.js` so video playback never 404s.

2. **Recommended Free Deployment (Render / Railway / Koyeb)**:
   - For full **1 GB video uploads**, **Socket.io multithreading**, **real-time VTS allocation**, and **unrestricted video playback**, deploy to **Render** or **Railway**.

---

## 3. How to Deploy to Render (100% Free & Easy)

1. **Push your code to GitHub**:
   Ensure your code is pushed to your GitHub fork (`https://github.com/rayyanm06/ALIVE-Based-Multithreaded-Distributed-Live-Video-Streaming-System`).

2. **Create a Free Account on Render**:
   Go to [render.com](https://render.com) and sign up using your GitHub account.

3. **Create a New Web Service**:
   - Click **New +** -> **Web Service**.
   - Connect your GitHub repository (`ALIVE-Based-Multithreaded-Distributed-Live-Video-Streaming-System`).

4. **Configure Deployment Settings**:
   - **Name**: `alive-video-streaming`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`

5. **Deploy**:
   - Click **Create Web Service**. Render will build and launch your application.
   - Your site will be live at `https://alive-video-streaming.onrender.com` with **full 1 GB video uploads**, **WebSockets**, and **Node.js worker threads**!

---

## 4. How to Deploy to Railway

1. Go to [railway.app](https://railway.app) and sign in with GitHub.
2. Click **New Project** -> **Deploy from GitHub repo**.
3. Select `ALIVE-Based-Multithreaded-Distributed-Live-Video-Streaming-System`.
4. Railway will auto-detect Node.js (`npm start`) and deploy the app instantly.

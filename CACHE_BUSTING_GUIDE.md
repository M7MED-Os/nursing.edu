/**
 * Cache Buster Script
 * Run this on live server to force refresh all clients
 */

// في sw.js - غيّر الرقم لرقم أعلى
const CACHE_NAME = 'nursing-edu-v35'; // كان v34

// لو عندك Cloudflare:
// 1. Dashboard > Caching > Purge Everything
// 2. أو Purge by URL للملفات المعدلة

// للمستخدمين القدام:
// Service worker هيمسح الكاش القديم تلقائي لما يشوف version جديد

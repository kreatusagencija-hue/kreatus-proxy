# Kreatus Proxy - Deploy na Render.com

## Koraki

1. Ustvari GitHub repo z imenovan `kreatus-proxy`
2. Naloži oba fajla: `server.js` in `package.json`
3. Pojdi na render.com → New → Web Service
4. Poveži GitHub repo
5. Nastavitve:
   - Name: `kreatus-proxy`
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: `Free`
6. Klikni Deploy
7. Kopiraj URL (npr. https://kreatus-proxy.onrender.com)
8. Prilepi URL v Kreatus tool → Nastavitve → Proxy URL

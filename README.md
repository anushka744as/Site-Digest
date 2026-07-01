# Site Digest ✦ AI-Powered Website Summarizer

Site Digest is a web application that takes a URL, scrapes its core text contents, and generates structured, clean summaries of the page. The app features a backend scraper + analysis pipeline and a frontend dashboard with premium visual aesthetics.

---

## 🚀 Quick Start

### 1. Requirements
Ensure you have the portable Node.js environment configured. If you are running inside this Antigravity terminal:
- Node.js is located at `/Users/anushkashah744/.gemini/antigravity/scratch/node-env/bin/node`.
- Prepended PATH: `export PATH="/Users/anushkashah744/.gemini/antigravity/scratch/node-env/bin:$PATH"`

### 2. Run the App
1. Navigate to the project root:
   ```bash
   cd /Users/anushkashah744/.gemini/antigravity/scratch/site-digest
   ```
2. Start the local server:
   ```bash
   export PATH="/Users/anushkashah744/.gemini/antigravity/scratch/node-env/bin:$PATH"
   npm start
   ```
3. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

### 3. AI Mode Setup
By default, the server runs in **Demo Fallback Mode** (generating local structural summaries). To unlock full AI synthesis:
1. Open the `.env` file in the root directory.
2. Replace `YOUR_GEMINI_API_KEY` with your actual key (get a free key from [Google AI Studio](https://aistudio.google.com/)).
3. Restart the server.

---

## 🛠️ Architecture & Decision Log

### 1. Single Page Processing (No Crawling)
- **Decision:** Summarize *only* the specific page matching the URL rather than crawling depth-first or breadth-first.
- **Trade-off/Reasoning:** Deep crawling takes significantly longer, triggers security filters (WAFs), introduces recursion risks (like circular path redirections), and consumes high LLM tokens. Processing a single page ensures fast response times (2-5s) and keeps resource consumption within the free-tier rate limits.
- **Roadmap:** A checkbox could be added to support depth-1 crawler pipelines for subpages of the same domain.

### 2. Client-Facing Latency Management
- **Decision:** Implement a step-by-step pipeline status checklist in the loading UI.
- **Trade-off/Reasoning:** Instead of showing a static loading circle, the frontend updates progressively to show the steps:
  1. `Connecting to server...`
  2. `Fetching web content (HTML)...`
  3. `Cleaning text boilerplate...`
  4. `Synthesizing summary with Gemini AI...`
- This keeps the user updated on what the backend is doing and turns the 3-second wait time into an engaging visual experience.

### 3. Text Processing Pipeline (Small vs. Large Pages)
- **Decision:** Scrape body content and prune structural noise, and truncate text to 2,500 words before feeding it to the LLM.
- **Trade-off/Reasoning:** Raw HTML is full of headers, footers, stylesheets, and scripting code. We use Cheerio to remove tags like `<script>`, `<style>`, `<header>`, `<footer>`, `<nav>`, `<aside>`.
- For very large sites, passing the entire raw body text could overflow token windows and increase latency. We extract text from `<p>`, `<li>`, and heading tags, and cap it at 2,500 words. This captures the central arguments of the page (usually in the header/body) while discarding long boilerplates.

### 4. Zero-Setup Demo Fallback Heuristics
- **Decision:** If the Gemini API Key is missing or invalid, generate a rule-based summary using local text heuristics instead of failing.
- **Trade-off/Reasoning:** This keeps the application fully functional out-of-the-box. The fallback algorithm extracts:
  - **Summary Paragraph:** Joining the first 3 readable paragraphs.
  - **Topics:** Highlighting the most frequent non-stopword terms.
  - **Takeaways:** Picking the first 3 sentences matching length heuristics.
  - An informative banner is shown in the frontend letting the user know they are in Demo Mode.

---

## 📂 Project Structure

```
site-digest/
├── package.json         # Express server dependencies & start script
├── server.js            # Node/Express backend (Scraper, Gemini API, Demo Heuristics)
├── .env                 # Environment variables
├── .env.example         # Environment template
├── README.md            # Documentation & architecture decisions
└── public/              # Frontend files
    ├── index.html       # Single-page application structure
    ├── index.css        # Visual styling system (Dark mode + Glassmorphic components)
    └── index.js         # Frontend controller (Form handler, Loading pipeline, API fetcher)
```

---

## ⚠️ Known Limitations & Future Improvements
1. **Dynamic Client-Side Sites (SPAs):** Pages that depend on client-side JS rendering (e.g. React/Vue without SSR) might return empty text since `axios` only fetches raw initial HTML. 
   - *Future Solution:* Introduce Puppeteer/Playwright headless browsers as a secondary scraper backend when plain HTML scraping yields no results.
2. **Scraper Blockers (Cloudflare):** Sites guarded by Cloudflare anti-bot checks may reject plain script requests.
   - *Future Solution:* Use rotating user-agents, request headers, or residential proxy API services.

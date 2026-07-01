const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable JSON body parsing
app.use(express.json());

// Serve static assets from public folder
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Truncate text to keep a reasonable number of words
 */
function truncateText(text, maxWords = 3000) {
  const words = text.split(/\s+/);
  if (words.length > maxWords) {
    return words.slice(0, maxWords).join(' ') + '...';
  }
  return text;
}

/**
 * Scrapes HTML from target URL and cleans text content
 */
async function scrapeUrl(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 12000, // 12 seconds timeout
      maxContentLength: 15 * 1024 * 1024 // 15MB limit
    });
    
    const html = response.data;
    if (typeof html !== 'string') {
      throw new Error('Response is not HTML');
    }

    const $ = cheerio.load(html);
    
    // Extract metadata
    const pageTitle = $('title').text().trim() || $('h1').first().text().trim() || 'Untitled Page';
    const metaDesc = $('meta[name="description"]').attr('content') || 
                     $('meta[property="og:description"]').attr('content') || 
                     $('meta[name="twitter:description"]').attr('content') || 
                     '';
                     
    // Clean unwanted elements that add noise or block tokens
    $('script, style, noscript, iframe, svg, head, header, footer, nav, aside').remove();
    $('.header, .footer, .nav, .navigation, #header, #footer, #nav, .menu, .sidebar').remove();
    
    // Extract text from elements representing core content
    let textParts = [];
    $('h1, h2, h3, h4, h5, h6, p, li, article, section').each((i, el) => {
      const txt = $(el).text().replace(/\s+/g, ' ').trim();
      if (txt.length > 12) {
        textParts.push(txt);
      }
    });
    
    // Fallback: If no headers/paragraphs met the criteria, grab body text
    let fullText = textParts.join('\n\n');
    if (fullText.trim().length < 50) {
      fullText = $('body').text().replace(/\s+/g, ' ').trim();
    }
    
    return {
      title: pageTitle,
      description: metaDesc.trim(),
      text: fullText.trim(),
      url: url
    };
  } catch (error) {
    let errorMsg = error.message;
    if (error.code === 'ECONNABORTED') {
      errorMsg = 'Request timed out (site was too slow to respond)';
    } else if (error.response) {
      errorMsg = `Server responded with status ${error.response.status}`;
    }
    throw new Error(`Failed to load site: ${errorMsg}`);
  }
}

/**
 * Generates summary using Gemini API
 */
async function generateAISummary(scrapedData, apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: { 
      responseMimeType: "application/json" 
    }
  });

  const prompt = `You are an expert website analyzer and summarizer.
Analyze the following web page content and produce a structured summary.

Website URL: ${scrapedData.url}
Page Title: ${scrapedData.title}
Meta Description: ${scrapedData.description || 'None provided'}

Page Text Content:
${truncateText(scrapedData.text, 2500)}

Your output must be a valid JSON object matching the following structure:
{
  "title": "Clean, human-readable title of the website (exclude trailing pipes, domain names unless key)",
  "description": "A crisp, one-sentence tagline or hook explaining what the website is or does (maximum 20 words)",
  "summary": "A detailed, high-quality summary paragraph (3-4 sentences) explaining the website's core purpose, business model or offerings, and unique value proposition",
  "targetAudience": "A single sentence defining who this website is built for (customers, developer community, researchers, etc.)",
  "keyTakeaways": [
    "A clear takeaway summarizing a key feature, service, or piece of info",
    "Another main takeaway",
    "Another main takeaway",
    "A final key takeaway"
  ],
  "topics": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}

Rule: Do not output any markdown formatting like \`\`\`json. Just return raw JSON. If the content is empty or contains nonsense, generate a response reflecting that you scanned it but found no meaningful content.`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const jsonText = response.text();
  return JSON.parse(jsonText);
}

/**
 * Generates rule-based summary fallback if Gemini API Key is missing
 */
function generateDemoSummary(scrapedData) {
  const cleanedText = scrapedData.text;
  const words = cleanedText.split(/\s+/).filter(w => w.length > 0);
  
  // Extract sentences
  const sentences = cleanedText
    .split(/[.!?]+\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && !s.includes('{') && !s.includes('}'));

  // Compile keywords for tags
  const stopWords = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'about', 'their', 'we', 'are', 'our', 'you']);
  const freqMap = {};
  words.forEach(w => {
    const word = w.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (word.length > 3 && !stopWords.has(word)) {
      freqMap[word] = (freqMap[word] || 0) + 1;
    }
  });
  
  const sortedKeywords = Object.keys(freqMap)
    .sort((a, b) => freqMap[b] - freqMap[a])
    .slice(0, 5);

  // Core summary paragraph
  let summaryParagraph = '';
  if (sentences.length > 0) {
    summaryParagraph = sentences.slice(0, Math.min(sentences.length, 3)).join('. ') + '.';
  } else if (scrapedData.description) {
    summaryParagraph = scrapedData.description;
  } else {
    summaryParagraph = 'Could not extract structural text paragraphs from this page. It may be a single-page app or dynamic canvas page.';
  }

  // Key takeaways
  const keyTakeaways = [];
  // Use description if available
  if (scrapedData.description) {
    keyTakeaways.push(`Meta Description: ${scrapedData.description}`);
  }
  
  // Add some distinct sentences
  for (let s of sentences) {
    if (s.length > 40 && s.length < 150 && !keyTakeaways.includes(s) && keyTakeaways.length < 4) {
      keyTakeaways.push(s);
    }
  }

  // Add fallback takeaways if needed
  while (keyTakeaways.length < 3) {
    keyTakeaways.push(`Word count of page: ${words.length} words`);
    keyTakeaways.push(`Extracted from URL: ${scrapedData.url}`);
    if (keyTakeaways.length >= 3) break;
  }

  return {
    title: scrapedData.title,
    description: scrapedData.description || 'Scraped in demo fallback mode.',
    summary: summaryParagraph,
    targetAudience: 'General Public (Extracted via Demo heuristic)',
    keyTakeaways: keyTakeaways.slice(0, 4),
    topics: sortedKeywords.length > 0 ? sortedKeywords : ['website', 'extracted', 'digest'],
    demoMode: true
  };
}

// REST API Endpoint to digest the URL
app.post('/api/summarize', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Basic URL format validation
  try {
    new URL(url);
  } catch (_) {
    return res.status(400).json({ error: 'Invalid URL format. Make sure to include http:// or https://' });
  }

  try {
    // 1. Scrape the URL
    const scrapedData = await scrapeUrl(url);

    if (!scrapedData.text || scrapedData.text.length < 30) {
      return res.status(422).json({ 
        error: 'Scraped page has insufficient readable text to generate a digest. The site might block scrapers or load content dynamically using JavaScript.' 
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    
    // 2. Synthesize Summary (Gemini API vs Demo Mode)
    if (apiKey && apiKey.trim() !== '' && apiKey !== 'YOUR_GEMINI_API_KEY') {
      try {
        const aiSummary = await generateAISummary(scrapedData, apiKey);
        return res.json({ ...aiSummary, demoMode: false });
      } catch (aiError) {
        console.error('Gemini API failed, falling back to Demo Mode summary:', aiError.message);
        // If API fails due to rate limits or key issues, fallback gracefully to demo mode with an alert
        const demoSummary = generateDemoSummary(scrapedData);
        return res.json({ 
          ...demoSummary, 
          fallbackAlert: `AI generation failed (${aiError.message}). Showing extracted fallback contents.` 
        });
      }
    } else {
      // Missing API key fallback
      const demoSummary = generateDemoSummary(scrapedData);
      return res.json(demoSummary);
    }

  } catch (error) {
    console.error('Processing error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    hasKey: !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY')
  });
});

app.listen(PORT, () => {
  console.log(`Site Digest server listening on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} in your browser.`);
});

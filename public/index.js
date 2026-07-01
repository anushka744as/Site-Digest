document.addEventListener('DOMContentLoaded', () => {
  const digestForm = document.getElementById('digest-form');
  const urlInput = document.getElementById('url-input');
  const submitBtn = document.getElementById('submit-btn');
  const statusBanner = document.getElementById('status-banner');
  
  const loadingCard = document.getElementById('loading-card');
  const errorCard = document.getElementById('error-card');
  const errorMessage = document.getElementById('error-message');
  const retryBtn = document.getElementById('retry-btn');
  const outputDashboard = document.getElementById('output-dashboard');

  // Loading Steps elements
  const stepConnect = document.getElementById('step-connect');
  const stepScrape = document.getElementById('step-scrape');
  const stepParse = document.getElementById('step-parse');
  const stepLlm = document.getElementById('step-llm');

  // Output elements
  const outputModeBadge = document.getElementById('output-mode-badge');
  const outputTitle = document.getElementById('output-title');
  const outputDescription = document.getElementById('output-description');
  const outputLink = document.getElementById('output-link');
  const outputTopics = document.getElementById('output-topics');
  const outputSummary = document.getElementById('output-summary');
  const outputAudience = document.getElementById('output-audience');
  const outputTakeaways = document.getElementById('output-takeaways');

  // Keep track of active timeouts for progress simulation
  let progressTimeouts = [];

  // Check server configuration status on load
  checkServerStatus();

  async function checkServerStatus() {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        if (!data.hasKey) {
          // Show Demo Mode Banner if Gemini key is missing
          statusBanner.classList.remove('hidden');
        } else {
          statusBanner.classList.add('hidden');
        }
      }
    } catch (err) {
      console.warn('Status check failed. Server might be offline:', err);
    }
  }

  // Handle Form Submission
  digestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();

    if (!url) return;

    // Reset UI states
    outputDashboard.classList.add('hidden');
    errorCard.classList.add('hidden');
    loadingCard.classList.remove('hidden');
    submitBtn.disabled = true;
    
    // Clear any previous progress timeouts
    progressTimeouts.forEach(clearTimeout);
    progressTimeouts = [];

    // Run Pipeline Progress Simulation
    simulatePipelineProgress();

    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze website');
      }

      // Finalize progress steps (instantly complete all steps)
      completeAllSteps();

      // Short delay before showing result to make transition smoother
      setTimeout(() => {
        loadingCard.classList.add('hidden');
        renderDashboard(data, url);
        submitBtn.disabled = false;
      }, 500);

    } catch (err) {
      // Clear progress timers
      progressTimeouts.forEach(clearTimeout);
      
      loadingCard.classList.add('hidden');
      errorCard.classList.remove('hidden');
      errorMessage.textContent = err.message || 'An unexpected error occurred during page digestion.';
      submitBtn.disabled = false;
    }
  });

  // Retry Button Focuses Input
  retryBtn.addEventListener('click', () => {
    errorCard.classList.add('hidden');
    urlInput.focus();
    urlInput.select();
  });

  /**
   * Simulates the loading pipeline status checkboxes
   */
  function simulatePipelineProgress() {
    // Reset all steps to pending
    const steps = [stepConnect, stepScrape, stepParse, stepLlm];
    steps.forEach(step => {
      step.className = 'step pending';
    });

    // Step 1: Connect active immediately
    stepConnect.className = 'step active';

    // Step 2: Scrape active after 600ms
    progressTimeouts.push(setTimeout(() => {
      stepConnect.className = 'step completed';
      stepScrape.className = 'step active';
    }, 600));

    // Step 3: Parse active after 1600ms
    progressTimeouts.push(setTimeout(() => {
      stepScrape.className = 'step completed';
      stepParse.className = 'step active';
    }, 1800));

    // Step 4: LLM active after 2800ms
    progressTimeouts.push(setTimeout(() => {
      stepParse.className = 'step completed';
      stepLlm.className = 'step active';
    }, 3000));
  }

  /**
   * Instantly completes all pipeline progress checkmarks
   */
  function completeAllSteps() {
    progressTimeouts.forEach(clearTimeout);
    stepConnect.className = 'step completed';
    stepScrape.className = 'step completed';
    stepParse.className = 'step completed';
    stepLlm.className = 'step completed';
  }

  /**
   * Renders the summary details on the output dashboard
   */
  function renderDashboard(data, originalUrl) {
    // 1. Set text contents
    outputTitle.textContent = data.title || 'Untitled Site';
    outputDescription.textContent = data.description || '';
    outputSummary.textContent = data.summary || 'No summary generated.';
    outputAudience.textContent = data.targetAudience || 'General Web Visitors';
    
    // Set external link
    outputLink.href = originalUrl;

    // 2. Set mode badge styling
    if (data.demoMode) {
      outputModeBadge.textContent = 'Demo Mode';
      outputModeBadge.className = 'mode-badge demo';
      
      // Keep status banner open to remind user
      statusBanner.classList.remove('hidden');
    } else {
      outputModeBadge.textContent = 'AI Mode';
      outputModeBadge.className = 'mode-badge';
      statusBanner.classList.add('hidden');
    }

    // 3. Render Topics Badges
    outputTopics.innerHTML = '';
    if (data.topics && Array.isArray(data.topics)) {
      data.topics.forEach(topic => {
        const badge = document.createElement('span');
        badge.className = 'topic-badge';
        badge.textContent = `#${topic.toLowerCase()}`;
        outputTopics.appendChild(badge);
      });
    }

    // 4. Render Takeaways Bullets
    outputTakeaways.innerHTML = '';
    if (data.keyTakeaways && Array.isArray(data.keyTakeaways)) {
      data.keyTakeaways.forEach(takeaway => {
        const li = document.createElement('li');
        li.textContent = takeaway;
        outputTakeaways.appendChild(li);
      });
    }

    // If there's an API fallback warning, overlay a temporary message or banner
    if (data.fallbackAlert) {
      statusBanner.className = 'status-banner fallback-mode';
      statusBanner.querySelector('.status-text').innerHTML = `<strong>Notice:</strong> ${data.fallbackAlert}`;
      statusBanner.classList.remove('hidden');
    }

    // Unhide output panel
    outputDashboard.classList.remove('hidden');
    outputDashboard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});

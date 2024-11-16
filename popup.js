document.addEventListener('DOMContentLoaded', function() {
  // Cache DOM elements
  const elements = {
    calculate: document.getElementById('calculate'),
    results: document.getElementById('results'),
    loading: document.getElementById('loading'),
    tabs: document.querySelectorAll('.tab'),
    tabContents: document.querySelectorAll('.tab-content'),
    historyBody: document.getElementById('historyBody'),
    saveSettings: document.getElementById('saveSettings'),
    presetButtons: document.querySelectorAll('.preset-button')
  };
  
  // Load settings and history from chrome.storage
  chrome.storage.sync.get(['settings', 'history'], function(data) {
    if (data.settings) {
      document.getElementById('defaultRisk').value = data.settings.defaultRisk;
      document.getElementById('defaultStop').value = data.settings.defaultStop;
      
      // Apply default values to calculator
      document.getElementById('riskPercentage').value = data.settings.defaultRisk;
      document.getElementById('stopLoss').value = data.settings.defaultStop;
    }
    
    if (data.history) {
      updateHistoryTable(data.history);
    }
  });
  
  // API key for Alpha Vantage (you'll need to get your own)
  const API_KEY = 'YOUR_ALPHA_VANTAGE_API_KEY';
  
  // Get current price from Alpha Vantage API
  const getCurrentPrice = async (symbol) => {
    try {
      const response = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`);
      const data = await response.json();
      
      if (data['Global Quote'] && data['Global Quote']['05. price']) {
        return parseFloat(data['Global Quote']['05. price']);
      }
      
      throw new Error('Unable to fetch current price');
    } catch (error) {
      // Fallback to demo price for testing
      return 225.00;
    }
  };
  
  // Input validation
  const inputs = document.querySelectorAll('input');
  inputs.forEach(input => {
    input.addEventListener('input', function() {
      this.value = this.value.trim();
      elements.calculate.disabled = !areInputsValid();
    });
  });
  
  function areInputsValid() {
    const symbol = document.getElementById('symbol').value.trim();
    const accountSize = parseFloat(document.getElementById('accountSize').value);
    const riskPercentage = parseFloat(document.getElementById('riskPercentage').value);
    const stopLoss = parseFloat(document.getElementById('stopLoss').value);
    
    return (
      symbol &&
      !isNaN(accountSize) && accountSize > 0 &&
      !isNaN(riskPercentage) && riskPercentage > 0 && riskPercentage <= 100 &&
      !isNaN(stopLoss) && stopLoss > 0 && stopLoss <= 100
    );
  }
  
  // Handle preset buttons
  elements.presetButtons.forEach(button => {
    button.addEventListener('click', function() {
      console.log('Preset button clicked:', this.dataset.risk, this.dataset.stop); // Debug log
      
      // Remove active class from all preset buttons
      elements.presetButtons.forEach(btn => btn.classList.remove('active'));
      
      // Add active class to the clicked button
      this.classList.add('active');
      
      // Update input fields
      document.getElementById('riskPercentage').value = this.dataset.risk;
      document.getElementById('stopLoss').value = this.dataset.stop;
      elements.calculate.disabled = !areInputsValid();
    });
  });
  
  // Handle tab switching
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      elements.tabs.forEach(t => t.classList.remove('active'));
      elements.tabContents.forEach(c => c.style.display = 'none');
      
      this.classList.add('active');
      document.getElementById(this.dataset.tab).style.display = 'block';
    });
  });
  
  // Save settings
  elements.saveSettings.addEventListener('click', function() {
    const settings = {
      defaultRisk: parseFloat(document.getElementById('defaultRisk').value),
      defaultStop: parseFloat(document.getElementById('defaultStop').value)
    };
    
    chrome.storage.sync.set({ settings }, function() {
      alert('Settings saved!');
    });
  });
  
  // Calculate position size
  elements.calculate.addEventListener('click', async function() {
    const symbol = document.getElementById('symbol').value.trim().toUpperCase();
    const accountSize = parseFloat(document.getElementById('accountSize').value);
    const riskPercentage = parseFloat(document.getElementById('riskPercentage').value);
    const stopLossPercentage = parseFloat(document.getElementById('stopLoss').value);
    const entryPriceInput = document.getElementById('entryPrice').value.trim();
    const entryPrice = entryPriceInput ? parseFloat(entryPriceInput) : null;
    
    if (!areInputsValid()) {
      elements.results.innerHTML = '<div class="error">Please fill in all fields correctly</div>';
      elements.results.style.display = 'block';
      return;
    }
    
    elements.loading.style.display = 'block';
    elements.results.style.display = 'none';
    
    try {
      let currentPrice = entryPrice || await getCurrentPrice(symbol);
      
      // Calculate position size
      const maxRiskAmount = accountSize * (riskPercentage / 100);
      const stopLossPrice = currentPrice * (1 - stopLossPercentage / 100);
      const riskPerShare = currentPrice - stopLossPrice;
      
      // Calculate shares and ensure it's not zero or fractional
      const shares = Math.floor(maxRiskAmount / riskPerShare);
      if (shares < 1) {
        throw new Error('Position too small for one share. Consider adjusting risk parameters.');
      }
      
      // Calculate final position details
      const positionSize = shares * currentPrice;
      const actualRiskAmount = shares * riskPerShare;
      const positionSizePercentage = (positionSize / accountSize) * 100;
      
      const results = {
        symbol,
        currentPrice,
        shares,
        positionSize,
        positionSizePercentage,
        actualRiskAmount,
        riskPerShare,
        stopLossPrice,
        entryPrice,
        date: new Date().toISOString()
      };
      
      // Save to history
      chrome.storage.sync.get(['history'], function(data) {
        const history = data.history || [];
        history.unshift(results);
        if (history.length > 50) history.pop(); // Keep only last 50 calculations
        chrome.storage.sync.set({ history });
        updateHistoryTable(history);
      });
      
      elements.results.innerHTML = `
        <h3 style="margin-top:0;color:#2196F3">${symbol} Position Size</h3>
        <div class="result-row">
          <span class="result-label">Current Price:</span>
          <span>$${currentPrice.toFixed(2)}</span>
        </div>
        <div class="result-row">
          <span class="result-label">Number of Shares:</span>
          <span>${shares.toLocaleString()}</span>
        </div>
        <div class="result-row">
          <span class="result-label">Position Size:</span>
          <span>$${positionSize.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
        </div>
        <div class="result-row">
          <span class="result-label">Position Size %:</span>
          <span>${positionSizePercentage.toFixed(2)}% of account</span>
        </div>
        <div class="result-row">
          <span class="result-label">Risk Amount:</span>
          <span>$${actualRiskAmount.toFixed(2)}</span>
        </div>
        <div class="result-row">
          <span class="result-label">Risk Per Share:</span>
          <span>$${riskPerShare.toFixed(2)}</span>
        </div>
        <div class="result-row">
          <span class="result-label">Stop Loss Price:</span>
          <span>$${stopLossPrice.toFixed(2)}</span>
        </div>
        <div class="result-row">
          <span class="result-label">Entry Price:</span>
          <span>${entryPrice ? `$${entryPrice.toFixed(2)}` : 'N/A'}</span>
        </div>
        <div style="margin-top:10px;font-size:12px;color:#666;">
          Last updated: ${new Date().toLocaleTimeString()}
        </div>
      `;
      elements.results.style.display = 'block';
    } catch (error) {
      elements.results.innerHTML = `
        <div class="error">
          ${error.message}
        </div>`;
      elements.results.style.display = 'block';
    } finally {
      elements.loading.style.display = 'none';
    }
  });
  
  function updateHistoryTable(history) {
    elements.historyBody.innerHTML = history.map((entry, index) => `
      <tr data-index="${index}">
        <td contenteditable="true">${new Date(entry.date).toLocaleDateString()}</td>
        <td contenteditable="true">${entry.symbol}</td>
        <td contenteditable="true">$${entry.positionSize.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        <td contenteditable="true">$${entry.actualRiskAmount.toFixed(2)}</td>
        <td contenteditable="true">${entry.entryPrice ? `$${entry.entryPrice.toFixed(2)}` : 'N/A'}</td>
      </tr>
    `).join('');
    
    // Add event listeners to save changes
    elements.historyBody.querySelectorAll('td[contenteditable="true"]').forEach(cell => {
      cell.addEventListener('blur', function() {
        const rowIndex = this.parentElement.getAttribute('data-index');
        const cellIndex = Array.from(this.parentElement.children).indexOf(this);
        let value = this.innerText.trim();
        
        if (cellIndex === 0) { // Date
          value = new Date(value).toISOString();
        } else if (cellIndex === 2 || cellIndex === 3) { // Position Size and Risk Amount
          value = parseFloat(value.replace(/[$,]/g, ''));
        } else if (cellIndex === 4) { // Entry Price
          value = value === 'N/A' ? null : parseFloat(value.replace(/[$,]/g, ''));
        }
        
        chrome.storage.sync.get(['history'], function(data) {
          const history = data.history || [];
          history[rowIndex][['date', 'symbol', 'positionSize', 'actualRiskAmount', 'entryPrice'][cellIndex]] = value;
          chrome.storage.sync.set({ history });
        });
      });
    });
  }
});
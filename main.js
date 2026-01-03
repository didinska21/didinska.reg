const puppeteer = require('puppeteer');
const fs = require('fs');
const readline = require('readline');

// Konfigurasi
const CONFIG = {
  registerURL: 'https://cryptowave.blog/auth?ref=EARN1D7265',
  referralCode: 'EARN1D7265',
  headless: true,
  accountDataFile: 'account_data.json'
};

// Proxy Configuration
const PROXY = {
  enabled: false, // Set true untuk enable proxy
  file: 'proxy.txt', // File berisi proxy (1 proxy yang auto-rotate IP)
  url: null // Akan di-load dari file
};

// Load proxy dari file
function loadProxy() {
  if (!PROXY.enabled) return null;
  
  if (PROXY.url) return PROXY.url; // Sudah di-load sebelumnya
  
  try {
    if (fs.existsSync(PROXY.file)) {
      const proxyContent = fs.readFileSync(PROXY.file, 'utf8').trim();
      if (proxyContent) {
        PROXY.url = proxyContent;
        console.log(`✓ Proxy loaded from ${PROXY.file}`);
        return PROXY.url;
      }
    }
    console.log(`⚠ ${PROXY.file} not found or empty. Running without proxy.`);
    PROXY.enabled = false;
    return null;
  } catch (e) {
    console.log(`⚠ Error loading proxy: ${e.message}`);
    PROXY.enabled = false;
    return null;
  }
}
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

// Generate random string
function generateRandomString(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateEmail() {
  return `user${generateRandomString(8)}@gmail.com`;
}

function generateDisplayName() {
  const adjectives = ['Cool', 'Happy', 'Smart', 'Brave', 'Quick', 'Silent', 'Bold', 'Swift'];
  const nouns = ['Tiger', 'Eagle', 'Dragon', 'Wolf', 'Phoenix', 'Hawk', 'Lion', 'Bear'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj}${noun}${Math.floor(Math.random() * 999)}`;
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Save account data
function saveAccountData(accountData) {
  let existingData = [];
  
  // Load existing data
  if (fs.existsSync(CONFIG.accountDataFile)) {
    try {
      const fileContent = fs.readFileSync(CONFIG.accountDataFile, 'utf8');
      existingData = JSON.parse(fileContent);
    } catch (e) {
      existingData = [];
    }
  }
  
  // Add new account
  existingData.push({
    ...accountData,
    registeredAt: new Date().toISOString()
  });
  
  // Save
  fs.writeFileSync(CONFIG.accountDataFile, JSON.stringify(existingData, null, 2));
}

// Register dengan Puppeteer
async function registerWithBrowser(userData, proxyUrl = null) {
  let browser = null;
  
  try {
    const launchOptions = {
      headless: CONFIG.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    };
    
    // Add proxy jika ada
    if (proxyUrl) {
      launchOptions.args.push(`--proxy-server=${proxyUrl}`);
    }
    
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    // Buka halaman register
    await page.goto(CONFIG.registerURL, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await delay(2000);

    // Tunggu form
    await page.waitForSelector('input[placeholder="Display Name"]', { timeout: 10000 });
    
    // Clear inputs
    await page.evaluate(() => {
      document.querySelectorAll('input').forEach(input => {
        if (input.type !== 'submit') input.value = '';
      });
    });

    await delay(1000);

    // Fill form
    await page.click('input[placeholder="Display Name"]');
    await delay(200);
    await page.type('input[placeholder="Display Name"]', userData.displayName, { delay: 80 });
    await delay(400);

    await page.click('input[placeholder="Email"]');
    await delay(200);
    await page.type('input[placeholder="Email"]', userData.email, { delay: 80 });
    await delay(400);

    await page.click('input[placeholder="Password"]');
    await delay(200);
    await page.type('input[placeholder="Password"]', userData.password, { delay: 80 });
    await delay(800);

    // Click submit
    const buttonClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const createButton = buttons.find(btn => 
        btn.textContent.includes('Create Account')
      );
      if (createButton) {
        createButton.click();
        return true;
      }
      return false;
    });

    if (!buttonClicked) {
      throw new Error('Submit button not found');
    }

    // Tunggu response
    try {
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
        delay(10000)
      ]);
    } catch (e) {
      await delay(5000);
    }

    const currentURL = page.url();
    let success = false;
    let message = '';

    // Check success
    if (currentURL.includes('cryptowave.blog') && !currentURL.includes('/auth')) {
      success = true;
      message = 'Success - Redirected';
    } else {
      const hasError = await page.evaluate(() => {
        const errorTexts = ['error', 'invalid', 'already', 'exists', 'failed'];
        const allText = document.body.innerText.toLowerCase();
        return errorTexts.some(err => allText.includes(err));
      });
      
      if (hasError) {
        const errorMsg = await page.evaluate(() => {
          const errorEl = document.querySelector('[class*="error"], [role="alert"]');
          return errorEl ? errorEl.textContent.trim() : 'Unknown error';
        });
        success = false;
        message = errorMsg;
      } else {
        success = true;
        message = 'Success - Likely registered';
      }
    }

    await page.close();
    await browser.close();

    return {
      success,
      email: userData.email,
      displayName: userData.displayName,
      password: userData.password,
      message,
      proxy: proxyUrl || 'No proxy'
    };

  } catch (error) {
    if (browser) await browser.close();
    
    return {
      success: false,
      email: userData.email,
      error: error.message
    };
  }
}

// Register multiple accounts
async function registerMultiple(count, options = {}) {
  console.clear();
  
  // Load proxy dari file
  const proxyUrl = loadProxy();
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('          CRYPTOWAVE AUTO REGISTER');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total Accounts  : ${count}`);
  console.log(`Referral Code   : ${CONFIG.referralCode}`);
  console.log(`Proxy Status    : ${PROXY.enabled ? 'ENABLED (Auto-Rotate)' : 'DISABLED'}`);
  if (proxyUrl) {
    // Hide credentials, show only host:port
    const proxyDisplay = proxyUrl.includes('@') 
      ? proxyUrl.split('@')[1] 
      : proxyUrl;
    console.log(`Proxy URL       : ${proxyDisplay}`);
  }
  console.log(`Password        : ${options.password || 'SecurePass123!'}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const results = [];
  const successAccounts = [];
  const startTime = Date.now();

  for (let i = 0; i < count; i++) {
    const accountNum = i + 1;
    console.log(`[${accountNum}/${count}] Processing...`);
    
    const userData = {
      email: options.emails?.[i] || generateEmail(),
      password: options.password || 'SecurePass123!',
      displayName: options.displayNames?.[i] || generateDisplayName()
    };

    const result = await registerWithBrowser(userData, proxyUrl);
    results.push(result);
    
    if (result.success) {
      console.log(`    ✓ ${result.email}`);
      console.log(`    └─ ${result.displayName}`);
      
      const accountData = {
        email: result.email,
        password: result.password,
        displayName: result.displayName,
        proxy: result.proxy
      };
      
      successAccounts.push(accountData);
      saveAccountData(accountData);
    } else {
      console.log(`    ✗ ${result.email}`);
      console.log(`    └─ ${result.error || result.message}`);
    }

    // Delay antar akun
    if (i < count - 1) {
      const delayTime = options.delay || 3000;
      const delaySeconds = Math.floor(delayTime / 1000);
      process.stdout.write(`    Waiting ${delaySeconds}s...`);
      await delay(delayTime);
      process.stdout.write('\r' + ' '.repeat(50) + '\r');
    }
    
    console.log('');
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  
  // Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('                    SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`Success         : ${successful}/${count}`);
  console.log(`Failed          : ${failed}/${count}`);
  console.log(`Success Rate    : ${((successful/count)*100).toFixed(1)}%`);
  console.log(`Duration        : ${duration}s`);
  
  if (successful > 0) {
    console.log(`Reward Earned   : ${successful * 20} WAVE ($${successful * 2}.00)`);
  }
  
  console.log('═══════════════════════════════════════════════════════════');
  
  if (successAccounts.length > 0) {
    console.log(`\n✓ ${successAccounts.length} accounts saved to ${CONFIG.accountDataFile}`);
  }
  
  console.log('');

  return { results, successAccounts };
}

// Main
async function main() {
  console.clear();
  console.log('═══════════════════════════════════════════════════════════');
  console.log('          CRYPTOWAVE AUTO REGISTER v2.0');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Input jumlah akun
  const countInput = await question('How many accounts to register? ');
  const count = parseInt(countInput);
  
  if (isNaN(count) || count <= 0) {
    console.log('Invalid number!');
    rl.close();
    return;
  }

  // Input password (opsional)
  const passwordInput = await question('Password for all accounts (Enter for default): ');
  const password = passwordInput.trim() || 'SecurePass123!';

  // Input delay (opsional)
  const delayInput = await question('Delay between accounts in seconds (Enter for 3s): ');
  const delaySeconds = parseInt(delayInput) || 3;
  
  rl.close();

  console.log('\nStarting registration...\n');
  await delay(1000);

  await registerMultiple(count, {
    password: password,
    delay: delaySeconds * 1000
  });
}

// Run
if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = { 
  registerWithBrowser,
  registerMultiple 
};

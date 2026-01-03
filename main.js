const puppeteer = require('puppeteer');
const fs = require('fs');

// Konfigurasi
const CONFIG = {
  registerURL: 'https://cryptowave.blog/auth?ref=EARN1D7265',
  referralCode: 'EARN1D7265',
  headless: true, // Set false jika ingin lihat browser (butuh GUI/X server)
  slowMo: 50
};

// Generate random string
function generateRandomString(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Generate random email
function generateEmail() {
  return `user${generateRandomString(8)}@gmail.com`;
}

// Generate random display name
function generateDisplayName() {
  const adjectives = ['Cool', 'Happy', 'Smart', 'Brave', 'Quick', 'Silent', 'Bold', 'Swift'];
  const nouns = ['Tiger', 'Eagle', 'Dragon', 'Wolf', 'Phoenix', 'Hawk', 'Lion', 'Bear'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj}${noun}${Math.floor(Math.random() * 999)}`;
}

// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Register dengan Puppeteer
async function registerWithBrowser(userData, browser = null) {
  const shouldCloseBrowser = !browser;
  
  try {
    // Launch browser jika belum ada
    if (!browser) {
      browser = await puppeteer.launch({
        headless: CONFIG.headless,
        slowMo: CONFIG.slowMo,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer'
        ]
      });
    }

    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1280, height: 720 });

    console.log(`📧 Email: ${userData.email}`);
    console.log(`👤 Display Name: ${userData.displayName}`);
    console.log(`🎁 Referral Code: ${CONFIG.referralCode}`);
    console.log(`🌐 Membuka halaman register...`);

    // Buka halaman register
    await page.goto(CONFIG.registerURL, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await delay(2000);

    // Tunggu form muncul
    console.log(`⏳ Menunggu form register...`);
    await page.waitForSelector('input[placeholder="Display Name"]', { timeout: 10000 });
    
    // Clear semua input dulu (jika ada value default)
    await page.evaluate(() => {
      document.querySelectorAll('input').forEach(input => {
        if (input.type !== 'submit') input.value = '';
      });
    });

    await delay(1000);

    // Fill Display Name
    console.log(`✍️  Mengisi Display Name...`);
    await page.click('input[placeholder="Display Name"]');
    await delay(300);
    await page.type('input[placeholder="Display Name"]', userData.displayName, { delay: 100 });
    await delay(500);

    // Fill Email
    console.log(`✍️  Mengisi Email...`);
    await page.click('input[placeholder="Email"]');
    await delay(300);
    await page.type('input[placeholder="Email"]', userData.email, { delay: 100 });
    await delay(500);

    // Fill Password
    console.log(`✍️  Mengisi Password...`);
    await page.click('input[placeholder="Password"]');
    await delay(300);
    await page.type('input[placeholder="Password"]', userData.password, { delay: 100 });
    await delay(500);

    // Referral code sudah auto-filled dari URL
    console.log(`✅ Referral Code: ${CONFIG.referralCode} (auto-filled dari URL)`);
    
    await delay(1000);

    // Screenshot sebelum submit (untuk debugging)
    const beforeScreenshot = `before_submit_${userData.email.replace(/[@.]/g, '_')}_${Date.now()}.png`;
    await page.screenshot({ path: beforeScreenshot });
    console.log(`📸 Screenshot disimpan: ${beforeScreenshot}`);

    // Click submit button - cari button dengan text "Create Account"
    console.log(`🚀 Klik tombol Create Account...`);
    
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
      throw new Error('Create Account button tidak ditemukan!');
    }

    // Tunggu response
    console.log(`⏳ Menunggu response...`);
    
    // Tunggu navigasi atau response
    try {
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
        delay(10000)
      ]);
    } catch (e) {
      console.log('⏳ Masih loading...');
      await delay(5000);
    }

    // Check apakah berhasil
    const currentURL = page.url();
    console.log(`📍 Current URL: ${currentURL}`);
    
    // Screenshot after submit
    const afterScreenshot = `after_submit_${userData.email.replace(/[@.]/g, '_')}_${Date.now()}.png`;
    await page.screenshot({ path: afterScreenshot });
    console.log(`📸 Screenshot disimpan: ${afterScreenshot}`);

    let success = false;
    let message = '';

    // Check indikator sukses
    if (currentURL.includes('cryptowave.blog') && !currentURL.includes('/auth')) {
      success = true;
      message = 'Berhasil! Redirect dari halaman auth';
    } else if (currentURL === CONFIG.registerURL || currentURL.includes('/auth')) {
      // Masih di halaman auth, cek apakah ada error
      try {
        // Cek error message
        const hasError = await page.evaluate(() => {
          const errorTexts = ['error', 'invalid', 'already', 'exists', 'failed'];
          const allText = document.body.innerText.toLowerCase();
          return errorTexts.some(err => allText.includes(err));
        });
        
        if (hasError) {
          const errorMsg = await page.evaluate(() => {
            // Coba ambil error message
            const errorEl = document.querySelector('[class*="error"], [role="alert"]');
            return errorEl ? errorEl.textContent.trim() : 'Unknown error';
          });
          success = false;
          message = `Error: ${errorMsg}`;
        } else {
          // Tidak ada error tapi masih di auth page
          // Mungkin perlu email verification
          success = true;
          message = 'Mungkin berhasil - Check email untuk verifikasi';
        }
      } catch (e) {
        success = true;
        message = 'Kemungkinan berhasil (tidak ada error terdeteksi)';
      }
    } else {
      success = true;
      message = 'Berhasil! URL berubah';
    }

    if (success) {
      console.log(`✅ Registrasi berhasil!`);
      console.log(`📊 ${message}`);
      
      // Tunggu load data
      await delay(3000);
      
      // Screenshot dashboard/final
      const successScreenshot = `success_${userData.email.replace(/[@.]/g, '_')}_${Date.now()}.png`;
      await page.screenshot({ path: successScreenshot, fullPage: true });
      console.log(`📸 Success screenshot: ${successScreenshot}`);
    } else {
      console.log(`❌ Registrasi gagal: ${message}`);
    }

    await page.close();

    return {
      success,
      email: userData.email,
      displayName: userData.displayName,
      password: userData.password,
      message,
      url: currentURL
    };

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    
    return {
      success: false,
      email: userData.email,
      error: error.message
    };
  } finally {
    if (shouldCloseBrowser && browser) {
      await browser.close();
    }
  }
}

// Register multiple accounts
async function registerMultiple(count = 5, options = {}) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 CRYPTOWAVE AUTO REGISTER (PUPPETEER)`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📝 Total akun: ${count}`);
  console.log(`🎁 Referral Code: ${CONFIG.referralCode}`);
  console.log(`🌐 Mode: ${CONFIG.headless ? 'Headless' : 'With Browser'}`);
  console.log(`${'='.repeat(60)}\n`);

  const results = [];
  const successAccounts = [];
  
  // Launch browser sekali untuk semua akun (lebih cepat)
  const browser = await puppeteer.launch({
    headless: CONFIG.headless,
    slowMo: CONFIG.slowMo,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer'
    ]
  });

  for (let i = 0; i < count; i++) {
    console.log(`\n[${i + 1}/${count}] ${'━'.repeat(40)}`);
    
    const userData = {
      email: options.emails?.[i] || generateEmail(),
      password: options.password || 'SecurePass123!',
      displayName: options.displayNames?.[i] || generateDisplayName()
    };

    const result = await registerWithBrowser(userData, browser);
    results.push(result);
    
    if (result.success) {
      successAccounts.push({
        email: result.email,
        password: result.password,
        displayName: result.displayName
      });
    }

    // Delay antar akun
    if (i < count - 1) {
      const delayTime = options.delay || 5000;
      console.log(`⏳ Menunggu ${delayTime/1000} detik...\n`);
      await delay(delayTime);
    }
  }

  await browser.close();

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 RINGKASAN HASIL`);
  console.log(`${'='.repeat(60)}`);
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`✅ Berhasil: ${successful}/${count}`);
  console.log(`❌ Gagal: ${failed}/${count}`);
  console.log(`📈 Success Rate: ${((successful/count)*100).toFixed(2)}%`);
  
  if (successful > 0) {
    console.log(`\n💰 Bonus Referral: ${successful} x 20 WAVE = ${successful * 20} WAVE ($${successful * 2}.00)`);
  }
  
  console.log(`${'='.repeat(60)}\n`);

  // Save hasil
  if (successAccounts.length > 0) {
    const filename = `accounts_${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(successAccounts, null, 2));
    console.log(`💾 Akun berhasil disimpan ke: ${filename}\n`);
    
    // Print list akun
    console.log(`📋 LIST AKUN BERHASIL:`);
    console.log(`${'='.repeat(60)}`);
    successAccounts.forEach((acc, idx) => {
      console.log(`${idx + 1}. Email: ${acc.email}`);
      console.log(`   Password: ${acc.password}`);
      console.log(`   Display Name: ${acc.displayName}`);
      console.log(`   ---`);
    });
  }

  return { results, successAccounts };
}

// Single registration
async function registerSingle(email, password, displayName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 CRYPTOWAVE REGISTER (PUPPETEER)`);
  console.log(`${'='.repeat(60)}\n`);
  
  const result = await registerWithBrowser({ email, password, displayName });
  
  if (result.success) {
    const accountData = {
      email: result.email,
      password: password,
      displayName: result.displayName
    };
    
    const filename = `account_${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(accountData, null, 2));
    console.log(`\n💾 Data akun disimpan ke: ${filename}`);
  }
  
  return result;
}

// Main
async function main() {
  // MODE 1: Single account
  // await registerSingle(
  //   'your.email@gmail.com',
  //   'YourPassword123!',
  //   'YourDisplayName'
  // );

  // MODE 2: Multiple auto (recommended)
  await registerMultiple(3, {
    password: 'SecurePass123!',
    delay: 5000 // 5 detik antar akun
  });

  // MODE 3: Multiple dengan email list
  // await registerMultiple(3, {
  //   emails: ['email1@gmail.com', 'email2@gmail.com', 'email3@gmail.com'],
  //   displayNames: ['Name1', 'Name2', 'Name3'],
  //   password: 'SecurePass123!',
  //   delay: 5000
  // });
}

// Run
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { 
  registerWithBrowser,
  registerSingle, 
  registerMultiple 
};

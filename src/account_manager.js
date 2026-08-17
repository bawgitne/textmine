const fs = require('fs');
const path = require('path');

const ACCOUNTS_FILE = path.join(__dirname, '../data/accounts.json');

class AccountManager {
  constructor() {
    this.accounts = [];
    this.initData();
  }

  initData() {
    try {
      const dataDir = path.dirname(ACCOUNTS_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(ACCOUNTS_FILE)) {
        const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
        this.accounts = JSON.parse(raw);
      } else {
        // Mặc định mảng rỗng, không tự tạo mock data
        this.accounts = [];
        this.saveData();
      }
    } catch (e) {
      console.error('Lỗi khi đọc file tài khoản:', e);
      this.accounts = [];
    }
  }

  generateDefaultAccounts() {
    return [];
  }


  saveData() {
    try {
      fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(this.accounts, null, 2), 'utf8');
    } catch (e) {
      console.error('Lỗi khi lưu tài khoản:', e);
    }
  }

  getAllAccounts() {
    return this.accounts;
  }

  saveAccount(accData) {
    const existingIdx = this.accounts.findIndex(a => a.id === accData.id || a.username === accData.username);
    const newAcc = {
      id: accData.id || `acc_${Date.now()}`,
      username: (accData.username || '').trim(),
      password: accData.password || '',
      authType: accData.authType || 'offline',
      assignedLetter: accData.assignedLetter || 'T1',
      autoDetectNearest: false
    };

    if (existingIdx !== -1) {
      this.accounts[existingIdx] = { ...this.accounts[existingIdx], ...newAcc };
    } else {
      this.accounts.push(newAcc);
    }

    this.saveData();
    return newAcc;
  }

  deleteAccount(id) {
    this.accounts = this.accounts.filter(a => a.id !== id && a.username !== id);
    this.saveData();
  }
}

module.exports = new AccountManager();

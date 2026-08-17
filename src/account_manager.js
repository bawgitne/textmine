const fs = require('fs');
const path = require('path');
const { AccountModel } = require('./db');

const ACCOUNTS_FILE = path.join(__dirname, '../data/accounts.json');

class AccountManager {
  constructor() {
    this.accounts = [];
    this.initData();
  }

  async initData() {
    try {
      // 1. Đọc từ file JSON cục bộ trước để làm bộ đệm khởi động nhanh
      const dataDir = path.dirname(ACCOUNTS_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(ACCOUNTS_FILE)) {
        const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
        this.accounts = JSON.parse(raw) || [];
      } else {
        this.accounts = [];
        this.saveDiskData();
      }

      // 2. Đồng bộ kết nối với MongoDB Atlas Cloud Database
      if (AccountModel) {
        const dbAccounts = await AccountModel.find({}).lean();
        if (dbAccounts && dbAccounts.length > 0) {
          this.accounts = dbAccounts.map(a => ({
            id: a.id,
            username: a.username,
            password: a.password || '1234',
            role: a.role || 'AFK_OVERWORLD',
            authType: a.authType || 'offline',
            assignedLetterId: a.assignedLetterId || null,
            bedPos: a.bedPos || null
          }));
          this.saveDiskData();
          console.log(`☁️ [MONGODB ATLAS] Đã tải ${this.accounts.length} bot accounts từ Cloud Database!`);
        }
      }
    } catch (e) {
      console.error('Lỗi khi đọc tài khoản:', e.message);
    }
  }

  saveDiskData() {
    try {
      fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(this.accounts, null, 2), 'utf8');
    } catch (e) {
      console.error('Lỗi khi lưu tài khoản vào đĩa:', e.message);
    }
  }

  getAllAccounts() {
    return this.accounts;
  }

  async saveAccount(accData) {
    const existingIdx = this.accounts.findIndex(a => a.id === accData.id || a.username === accData.username);
    const newAcc = {
      id: accData.id || accData.username || `acc_${Date.now()}`,
      username: (accData.username || '').trim(),
      password: accData.password || '1234',
      role: accData.role || 'AFK_OVERWORLD',
      authType: accData.authType || 'offline',
      assignedLetterId: accData.assignedLetterId || null,
      bedPos: accData.bedPos || null
    };

    if (existingIdx !== -1) {
      this.accounts[existingIdx] = { ...this.accounts[existingIdx], ...newAcc };
    } else {
      this.accounts.push(newAcc);
    }

    // Lưu đĩa cứng
    this.saveDiskData();

    // Lưu MongoDB Atlas Cloud
    try {
      await AccountModel.findOneAndUpdate({ id: newAcc.id }, newAcc, { upsert: true, new: true });
    } catch (err) {
      console.error('⚠️ [MONGODB ATLAS] Lỗi lưu account:', err.message);
    }

    return newAcc;
  }

  async deleteAccount(id) {
    this.accounts = this.accounts.filter(a => a.id !== id && a.username !== id);
    this.saveDiskData();

    try {
      await AccountModel.deleteOne({ $or: [{ id: id }, { username: id }] });
    } catch (err) {
      console.error('⚠️ [MONGODB ATLAS] Lỗi xóa account:', err.message);
    }
  }
}

module.exports = new AccountManager();

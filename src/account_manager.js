const fs = require('fs');
const path = require('path');
const { AccountModel, getIsDBConnected } = require('./db');
const { BUILDER_ASSIGNMENTS, getBuilderAssignment } = require('./builder_assignments');

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
        this.accounts = (JSON.parse(raw) || []).map(account => ({
          ...account,
          assignedLetterId: getBuilderAssignment(account.username) || account.assignedLetterId || null
        }));
      } else {
        this.accounts = [];
        this.saveDiskData();
      }

      await this.syncWithDB();
    } catch (e) {
      console.error('Lỗi khi đọc tài khoản:', e.message);
    }
  }

  async syncWithDB() {
    if (getIsDBConnected() && AccountModel) {
      try {
        const dbAccounts = await AccountModel.find({}).lean();
        if (dbAccounts && dbAccounts.length > 0) {
          this.accounts = dbAccounts.map(a => {
            const assigned = getBuilderAssignment(a.username) || a.assignedLetterId || null;
            return {
              id: a.id,
              username: a.username,
              password: a.password || '1234',
              role: a.role || 'AFK_OVERWORLD',
              authType: a.authType || 'offline',
              assignedLetterId: assigned,
              bedPos: a.bedPos || null
            };
          });
          this.saveDiskData();
          console.log(`☁️ [MONGODB ATLAS] Đã đồng bộ ${this.accounts.length} bot accounts từ Cloud Database!`);

          // Tạo account mặc định cho builder nếu còn thiếu trong DB mà không đè role đã cài
          const fixedBuilderAccounts = await Promise.all(Object.entries(BUILDER_ASSIGNMENTS).map(([username, assignedLetterId]) =>
            AccountModel.findOneAndUpdate(
              { username },
              {
                $set: { assignedLetterId },
                $setOnInsert: { id: username, password: '1234', role: 'BUILDER', authType: 'offline' }
              },
              { upsert: true, returnDocument: 'after' }
            )
          ));
          fixedBuilderAccounts.forEach(doc => {
            const account = doc.toObject ? doc.toObject() : doc;
            const index = this.accounts.findIndex(item => item.username === account.username);
            const normalized = {
              id: account.id,
              username: account.username,
              password: account.password || '1234',
              role: account.role || 'BUILDER',
              authType: account.authType || 'offline',
              assignedLetterId: getBuilderAssignment(account.username),
              bedPos: account.bedPos || null
            };
            if (index === -1) this.accounts.push(normalized);
            else this.accounts[index] = { ...this.accounts[index], ...normalized };
          });
          this.saveDiskData();
        }
      } catch (e) {
        console.error('⚠️ [MONGODB ATLAS ERROR] Lỗi khi sync accounts:', e.message);
      }
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
      assignedLetterId: getBuilderAssignment(accData.username) || accData.assignedLetterId || null,
      bedPos: accData.bedPos || null
    };

    if (existingIdx !== -1) {
      this.accounts[existingIdx] = { ...this.accounts[existingIdx], ...newAcc };
    } else {
      this.accounts.push(newAcc);
    }

    // Lưu đĩa cứng
    this.saveDiskData();

    // Lưu MongoDB Atlas Cloud nếu có kết nối
    if (getIsDBConnected() && AccountModel) {
      try {
        await AccountModel.findOneAndUpdate({ id: newAcc.id }, newAcc, { upsert: true, returnDocument: 'after' });
      } catch (err) {
        console.error('⚠️ [MONGODB ATLAS] Lỗi lưu account:', err.message);
      }
    }

    return newAcc;
  }

  async deleteAccount(id) {
    this.accounts = this.accounts.filter(a => a.id !== id && a.username !== id);
    this.saveDiskData();

    if (getIsDBConnected() && AccountModel) {
      try {
        await AccountModel.deleteOne({ $or: [{ id: id }, { username: id }] });
      } catch (err) {
        console.error('⚠️ [MONGODB ATLAS] Lỗi xóa account:', err.message);
      }
    }
  }
}

module.exports = new AccountManager();

import { MongoClient } from 'mongodb';

class DBClient {
  constructor() {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || '27017';
    const database = process.env.DB_DATABASE || 'files_manager';

    const url = `mongodb://${host}:${port}`;
    this.client = new MongoClient(url, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    this.dbName = database;
    this.connection = null;
  }

  async connect() {
    try {
      this.connection = await this.client.connect();
      this.db = this.connection.db(this.dbName);
      return true;
    } catch (error) {
      console.error('MongoDB connection error:', error);
      this.connection = null;
      return false;
    }
  }

  isAlive() {
    return this.connection !== null;
  }

  async nbUsers() {
    try {
      if (!this.connection) await this.connect();
      return await this.db.collection('users').countDocuments();
    } catch (error) {
      console.error('Error counting users:', error);
      return 0;
    }
  }

  async nbFiles() {
    try {
      if (!this.connection) await this.connect();
      return await this.db.collection('files').countDocuments();
    } catch (error) {
      console.error('Error counting files:', error);
      return 0;
    }
  }
}

const dbClient = new DBClient();

// Attempt to connect immediately
dbClient.connect();

export default dbClient;

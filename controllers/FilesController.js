import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class FilesController {
  static async postUpload(req, res) {
    const { name, type, parentId = 0, isPublic = false, data } = req.body;
    const token = req.headers['x-token'];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check missing fields
    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }

    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }

    if (type !== 'folder' && !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    // Validate parentId if provided
    if (parentId !== 0) {
      const db = dbClient.client.db(dbClient.dbName);
      const filesCollection = db.collection('files');
      const parentFile = await filesCollection.findOne({ _id: dbClient.getObjectId(parentId) });

      if (!parentFile) {
        return res.status(400).json({ error: 'Parent not found' });
      }

      if (parentFile.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    // Handle file upload and storage
    if (type !== 'folder') {
      const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
      const filePath = path.join(folderPath, uuidv4());
      const buffer = Buffer.from(data, 'base64');

      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      fs.writeFileSync(filePath, buffer);

      // Add file to the database
      const db = dbClient.client.db(dbClient.dbName);
      const filesCollection = db.collection('files');
      const result = await filesCollection.insertOne({
        userId,
        name,
        type,
        isPublic,
        parentId,
        localPath: filePath,
      });

      return res.status(201).json({
        id: result.insertedId,
        userId,
        name,
        type,
        isPublic,
        parentId,
        localPath: filePath,
      });
    }

    // Handle folder creation
    const db = dbClient.client.db(dbClient.dbName);
    const filesCollection = db.collection('files');
    const result = await filesCollection.insertOne({
      userId,
      name,
      type,
      isPublic,
      parentId,
    });

    return res.status(201).json({
      id: result.insertedId,
      userId,
      name,
      type,
      isPublic,
      parentId,
    });
  }
}

export default FilesController;

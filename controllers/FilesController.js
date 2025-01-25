import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class FilesController {
  static async postUpload(req, res) {
    // Get token and validate user
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Validate request body
    const { name, type, parentId = '0', isPublic = false, data } = req.body;

    // Validate name
    if (!name) return res.status(400).json({ error: 'Missing name' });

    // Validate type
    const validTypes = ['folder', 'file', 'image'];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }

    // Validate data for non-folder types
    if (type !== 'folder' && !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    // Validate parent
    const db = dbClient.db;
    if (parentId !== '0') {
      const parentFile = await db.collection('files').findOne({ _id: dbClient.objectId(parentId) });
      if (!parentFile) return res.status(400).json({ error: 'Parent not found' });
      if (parentFile.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    // Determine storage path
    const storagePath = process.env.FOLDER_PATH || '/tmp/files_manager';
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }

    // Prepare file document
    const newFile = {
      userId: dbClient.objectId(userId),
      name,
      type,
      isPublic,
      parentId: parentId === '0' ? '0' : dbClient.objectId(parentId)
    };

    // Handle file/image storage
    if (type !== 'folder') {
      const fileUuid = uuidv4();
      const localPath = path.join(storagePath, fileUuid);
      
      // Decode and write file
      const fileBuffer = Buffer.from(data, 'base64');
      fs.writeFileSync(localPath, fileBuffer);

      newFile.localPath = localPath;
    }

    // Insert file document
    const result = await db.collection('files').insertOne(newFile);
    const fileDoc = result.ops[0];

    // Return created file
    return res.status(201).json({
      id: fileDoc._id,
      userId: fileDoc.userId,
      name: fileDoc.name,
      type: fileDoc.type,
      isPublic: fileDoc.isPublic,
      parentId: fileDoc.parentId
    });
  }
}

export default FilesController;
import Queue from 'bull';
import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { mkdir, writeFile, readFileSync } from 'fs';
import mime from 'mime-types';
import dbClient from '../utils/db';
import { getIdAndKey, isValidUser } from '../utils/users';

class FilesController {
  static async uploadFile(request, response) {
    const fileQueue = new Queue('fileQueue');
    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';

    const { userId } = await getIdAndKey(request);
    if (!isValidUser(userId)) return response.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.users.findOne({ _id: ObjectId(userId) });
    if (!user) return response.status(401).json({ error: 'Unauthorized' });

    const { name, type, data, isPublic = false, parentId = 0 } = request.body;

    if (!name) return response.status(400).json({ error: 'Missing name' });
    if (!type || !['folder', 'file', 'image'].includes(type)) return response.status(400).json({ error: 'Invalid type' });

    if (!data && type !== 'folder') return response.status(400).json({ error: 'Missing data' });

    const parentFileId = parentId === '0' ? 0 : parentId;
    if (parentFileId !== 0) {
      const parentFile = await dbClient.files.findOne({ _id: ObjectId(parentFileId) });
      if (!parentFile) return response.status(400).json({ error: 'Parent not found' });
      if (parentFile.type !== 'folder') return response.status(400).json({ error: 'Parent is not a folder' });
    }

    const fileDetails = {
      userId: user._id,
      name,
      type,
      isPublic,
      parentId: parentFileId,
    };

    if (type === 'folder') {
      const result = await dbClient.files.insertOne(fileDetails);
      return response.status(201).json({ ...fileDetails, id: result.insertedId });
    }

    const uniqueFileName = uuidv4();
    const decodedData = Buffer.from(data, 'base64');
    const filePath = `${folderPath}/${uniqueFileName}`;

    mkdir(folderPath, { recursive: true }, (error) => {
      if (error) return response.status(500).json({ error: error.message });
    });

    writeFile(filePath, decodedData, (error) => {
      if (error) return response.status(500).json({ error: error.message });
    });

    fileDetails.localPath = filePath;
    const result = await dbClient.files.insertOne(fileDetails);

    fileQueue.add({ userId: fileDetails.userId, fileId: result.insertedId });

    return response.status(201).json({ ...fileDetails, id: result.insertedId });
  }

  static async getFileDetails(request, response) {
    const { userId } = await getIdAndKey(request);
    if (!isValidUser(userId)) return response.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.users.findOne({ _id: ObjectId(userId) });
    if (!user) return response.status(401).json({ error: 'Unauthorized' });

    const { id } = request.params;
    const file = await dbClient.files.findOne({ _id: ObjectId(id), userId: user._id });
    if (!file) return response.status(404).json({ error: 'Not found' });

    return response.status(200).json(file);
  }

  static async listFiles(request, response) {
    const { userId } = await getIdAndKey(request);
    if (!isValidUser(userId)) return response.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.users.findOne({ _id: ObjectId(userId) });
    if (!user) return response.status(401).json({ error: 'Unauthorized' });

    let { parentId = 0, page = 0 } = request.query;
    parentId = parentId === '0' ? 0 : ObjectId(parentId);

    const query = parentId === 0 ? {} : { parentId };
    const files = await dbClient.files
      .find(query)
      .skip(page * 20)
      .limit(20)
      .toArray();

    return response.status(200).json(files);
  }

  static async toggleFileVisibility(request, response, isPublic) {
    const { userId } = await getIdAndKey(request);
    if (!isValidUser(userId)) return response.status(401).json({ error: 'Unauthorized' });

    const { id } = request.params;
    let file = await dbClient.files.findOne({ _id: ObjectId(id), userId: ObjectId(userId) });
    if (!file) return response.status(404).json({ error: 'Not found' });

    await dbClient.files.updateOne({ _id: ObjectId(id) }, { $set: { isPublic } });
    file = await dbClient.files.findOne({ _id: ObjectId(id) });

    return response.status(200).json(file);
  }

  static publishFile(request, response) {
    return this.toggleFileVisibility(request, response, true);
  }

  static unpublishFile(request, response) {
    return this.toggleFileVisibility(request, response, false);
  }

  static async downloadFile(request, response) {
    const { id } = request.params;
    const size = request.query.size || 0;

    const file = await dbClient.files.findOne({ _id: ObjectId(id) });
    if (!file) return response.status(404).json({ error: 'Not found' });

    const { isPublic, userId, type, localPath, name } = file;

    const { userId: requestUserId } = await getIdAndKey(request);

    if (!isPublic && (!requestUserId || userId.toString() !== requestUserId)) {
      return response.status(403).json({ error: 'Access denied' });
    }

    if (type === 'folder') return response.status(400).json({ error: 'Folders cannot be downloaded' });

    const filePath = size === 0 ? localPath : `${localPath}_${size}`;
    try {
      const fileData = readFileSync(filePath);
      response.setHeader('Content-Type', mime.contentType(name));
      return response.status(200).send(fileData);
    } catch {
      return response.status(404).json({ error: 'File not found' });
    }
  }
}

export default FilesController;
